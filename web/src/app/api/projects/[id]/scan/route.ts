import { NextResponse } from "next/server";

import { requireConnection } from "@/lib/auth";
import { handleApiError, jsonError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { executeScan } from "@/lib/scanner";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    await requireConnection();

    const project = await prisma.project.findUnique({
      where: { id: params.id },
    });
    if (!project) return jsonError("Project not found", 404);

    const scan = await prisma.scan.create({
      data: {
        projectId: project.id,
        status: "pending",
        branch: project.defaultBranch,
      },
    });

    // Fire and forget. The orchestrator updates the Scan row as it progresses;
    // the client polls /api/scans/[id]. Errors inside executeScan are caught
    // there and persisted to the row's errorMessage.
    void executeScan(scan.id).catch(() => {});

    return NextResponse.json({
      scan: { id: scan.id, status: scan.status },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
