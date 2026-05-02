import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await prisma.gitlabConnection.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
