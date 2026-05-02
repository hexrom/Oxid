import { NextResponse } from "next/server";

import {
  handleApiError,
  jsonError,
  parseStringArray,
  parseSummary,
} from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const scan = await prisma.scan.findUnique({
      where: { id: params.id },
      include: {
        findings: true,
        project: {
          select: { id: true, name: true, nameWithNamespace: true },
        },
      },
    });

    if (!scan) return jsonError("Scan not found", 404);

    return NextResponse.json({
      scan: {
        id: scan.id,
        projectId: scan.projectId,
        project: scan.project,
        status: scan.status,
        branch: scan.branch,
        commitSha: scan.commitSha,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        duration: scan.duration,
        summary: parseSummary(scan.summary),
        errorMessage: scan.errorMessage,
      },
      findings: scan.findings.map((f) => ({
        id: f.id,
        findingId: f.findingId,
        title: f.title,
        description: f.description,
        severity: f.severity,
        kind: f.kind,
        packageName: f.packageName,
        packageVersion: f.packageVersion,
        filePath: f.filePath,
        line: f.line,
        column: f.column,
        remediation: f.remediation,
        references: parseStringArray(f.references),
        sourceScanners: parseStringArray(f.sourceScanners),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
