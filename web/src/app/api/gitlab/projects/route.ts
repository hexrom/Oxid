import { NextResponse } from "next/server";

import { requireConnection } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listMembershipProjects } from "@/lib/gitlab";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const conn = await requireConnection();
    const url = new URL(req.url);
    const search = url.searchParams.get("search") ?? undefined;
    const pageRaw = url.searchParams.get("page");
    const page = pageRaw ? Math.max(1, Number(pageRaw)) : 1;
    const rustOnly = url.searchParams.get("rust_only") !== "false";

    const result = await listMembershipProjects(conn.accessToken, {
      search,
      page,
      rustOnly,
    });

    const importedIds = await prisma.project.findMany({
      where: {
        gitlabProjectId: {
          in: result.projects.map((p) => p.id),
        },
      },
      select: { gitlabProjectId: true },
    });
    const importedSet = new Set(importedIds.map((p) => p.gitlabProjectId));

    const projects = result.projects.map((p) => ({
      ...p,
      alreadyImported: importedSet.has(p.id),
    }));

    return NextResponse.json({ projects, nextPage: result.nextPage });
  } catch (err) {
    return handleApiError(err);
  }
}
