import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  buildAuthedCloneUrl,
  redactToken,
} from "@/lib/gitlab";
import {
  type OxidFinding,
  type SeveritySummary,
  summarizeFindings,
} from "@/lib/types";

/** Public entry point. Idempotent per scanId — caller creates the Scan row first. */
export async function executeScan(scanId: string): Promise<void> {
  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    include: { project: true },
  });
  if (!scan) return;

  const project = scan.project;
  const connection = await prisma.gitlabConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!connection) {
    await failScan(scanId, "No GitLab connection. Reconnect to scan.");
    return;
  }

  let tempDir: string | null = null;
  const startedAt = Date.now();
  const accessToken = connection.accessToken;

  try {
    await prisma.scan.update({
      where: { id: scanId },
      data: { status: "running", startedAt: new Date(startedAt) },
    });

    tempDir = await mkdtemp(join(tmpdir(), `oxid-${randomUUID()}-`));

    const authedUrl = buildAuthedCloneUrl(project.httpUrlToRepo, accessToken);
    await runCommand(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        scan.branch,
        "--single-branch",
        authedUrl,
        tempDir,
      ],
      {
        token: accessToken,
        timeoutMs: 120_000,
        // Avoid prompting for credentials if the URL fails.
        env: { GIT_TERMINAL_PROMPT: "0" },
      },
    );

    const commitSha = await readHeadSha(tempDir);

    const { stdout } = await runCommand(
      env.oxidBin(),
      ["scan", "--format", "json"],
      {
        cwd: tempDir,
        token: accessToken,
        timeoutMs: env.scanTimeoutMs(),
      },
    );

    const findings = parseFindings(stdout);
    const summary = summarizeFindings(findings);
    const completedAt = Date.now();

    await prisma.$transaction([
      prisma.finding.createMany({
        data: findings.map((f) => toFindingRow(scanId, f)),
      }),
      prisma.scan.update({
        where: { id: scanId },
        data: {
          status: "completed",
          completedAt: new Date(completedAt),
          duration: completedAt - startedAt,
          commitSha,
          summary: JSON.stringify(summary satisfies SeveritySummary),
          errorMessage: null,
        },
      }),
    ]);
  } catch (err) {
    const message = redactToken(
      err instanceof Error ? err.message : String(err),
      accessToken,
    );
    await failScan(scanId, message, Date.now() - startedAt);
  } finally {
    if (tempDir) {
      // SECURITY-CRITICAL: a leaked temp dir contains an OAuth token in
      // .git/config. This must always run.
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function failScan(
  scanId: string,
  message: string,
  durationMs?: number,
): Promise<void> {
  await prisma.scan.update({
    where: { id: scanId },
    data: {
      status: "failed",
      completedAt: new Date(),
      duration: durationMs ?? null,
      errorMessage: message.slice(0, 4000),
    },
  });
}

interface RunOptions {
  cwd?: string;
  token: string;
  timeoutMs: number;
  env?: Record<string, string>;
}

interface RunResult {
  stdout: string;
  stderr: string;
}

function runCommand(
  command: string,
  args: string[],
  opts: RunOptions,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `failed to spawn ${command}: ${redactToken(err.message, opts.token)}`,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} timed out after ${opts.timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        const tail = redactToken(stderr.trim().slice(-1500), opts.token);
        reject(
          new Error(
            `${command} exited with code ${code}${tail ? `: ${tail}` : ""}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function readHeadSha(repoDir: string): Promise<string | null> {
  try {
    const { stdout } = await runCommand("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
      token: "",
      timeoutMs: 5_000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function parseFindings(stdout: string): OxidFinding[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // The CLI sometimes prefixes with progress indicators; try to recover the
    // first JSON array we can find.
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(trimmed.slice(start, end + 1));
    } else {
      throw new Error("oxid did not produce valid JSON output");
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error("oxid JSON output was not an array");
  }
  return parsed as OxidFinding[];
}

function toFindingRow(scanId: string, f: OxidFinding) {
  return {
    scanId,
    findingId: f.id,
    title: f.title,
    description: f.description ?? null,
    severity: f.severity,
    kind: f.kind,
    packageName: f.package ?? null,
    packageVersion: f.version ?? null,
    filePath: f.location?.file ?? null,
    line: f.location?.line ?? null,
    column: f.location?.column ?? null,
    remediation: f.remediation ?? null,
    references:
      f.references && f.references.length > 0
        ? JSON.stringify(f.references)
        : null,
    sourceScanners: JSON.stringify(f.source_scanners ?? []),
  };
}
