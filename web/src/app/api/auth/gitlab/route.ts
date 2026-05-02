import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { handleApiError, jsonError } from "@/lib/api";
import { isGitlabConfigured } from "@/lib/env";
import { buildAuthorizeUrl } from "@/lib/gitlab";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isGitlabConfigured()) {
      return jsonError(
        "GitLab OAuth not configured. Set GITLAB_APP_ID and GITLAB_APP_SECRET.",
        500,
      );
    }
    const state = randomBytes(16).toString("hex");
    const url = buildAuthorizeUrl(state);
    const res = NextResponse.redirect(url);
    res.cookies.set("oxid_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}

export const POST = GET;
