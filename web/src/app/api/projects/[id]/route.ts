import { NextResponse } from "next/server";

import { handleApiError, jsonError, parseSummary } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        scans: {
          orderBy: { startedAt: "desc" },
          take: 25,
        },
      },
    });

    if (!project) return jsonError("Project not found", 404);

    return NextResponse.json({
      project: {
        id: project.id,
        gitlabProjectId: project.gitlabProjectId,
        name: project.name,
        nameWithNamespace: project.nameWithNamespace,
        defaultBranch: project.defaultBranch,
        httpUrlToRepo: project.httpUrlToRepo,
        webUrl: project.webUrl,
        language: project.language,
        importedAt: project.importedAt,
      },
      scans: project.scans.map((s) => ({
        id: s.id,
        status: s.status,
        branch: s.branch,
        commitSha: s.commitSha,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        duration: s.duration,
        summary: parseSummary(s.summary),
        errorMessage: s.errorMessage,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.project.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
