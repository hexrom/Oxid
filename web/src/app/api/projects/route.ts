import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, parseSummary } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ImportSchema = z.object({
  gitlabProjectId: z.number().int(),
  name: z.string().min(1),
  nameWithNamespace: z.string().min(1),
  defaultBranch: z.string().min(1).default("main"),
  httpUrlToRepo: z.string().url(),
  webUrl: z.string().url(),
  language: z.string().optional(),
});

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { importedAt: "desc" },
      include: {
        scans: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    });

    const result = projects.map((p) => {
      const latest = p.scans[0] ?? null;
      return {
        id: p.id,
        gitlabProjectId: p.gitlabProjectId,
        name: p.name,
        nameWithNamespace: p.nameWithNamespace,
        defaultBranch: p.defaultBranch,
        httpUrlToRepo: p.httpUrlToRepo,
        webUrl: p.webUrl,
        language: p.language,
        importedAt: p.importedAt,
        latestScan: latest
          ? {
              id: latest.id,
              status: latest.status,
              startedAt: latest.startedAt,
              completedAt: latest.completedAt,
              duration: latest.duration,
              summary: parseSummary(latest.summary),
            }
          : null,
      };
    });

    return NextResponse.json({ projects: result });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = ImportSchema.parse(body);

    const project = await prisma.project.upsert({
      where: { gitlabProjectId: data.gitlabProjectId },
      create: {
        gitlabProjectId: data.gitlabProjectId,
        name: data.name,
        nameWithNamespace: data.nameWithNamespace,
        defaultBranch: data.defaultBranch || "main",
        httpUrlToRepo: data.httpUrlToRepo,
        webUrl: data.webUrl,
        language: data.language ?? "Rust",
      },
      update: {
        name: data.name,
        nameWithNamespace: data.nameWithNamespace,
        defaultBranch: data.defaultBranch || "main",
        httpUrlToRepo: data.httpUrlToRepo,
        webUrl: data.webUrl,
        language: data.language ?? "Rust",
      },
    });

    return NextResponse.json({ project });
  } catch (err) {
    return handleApiError(err);
  }
}
