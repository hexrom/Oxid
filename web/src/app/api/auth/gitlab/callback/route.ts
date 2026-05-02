import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { exchangeCodeForToken, fetchCurrentUser } from "@/lib/gitlab";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToError(`GitLab returned an error: ${error}`);
  }
  if (!code) {
    return redirectToError("Missing authorization code from GitLab");
  }

  const cookieState = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("oxid_oauth_state="))
    ?.slice("oxid_oauth_state=".length);
  if (!cookieState || cookieState !== state) {
    return redirectToError("OAuth state mismatch. Please try again.");
  }

  try {
    const token = await exchangeCodeForToken(code);
    const user = await fetchCurrentUser(token.access_token);

    const tokenExpiresAt = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null;

    await prisma.gitlabConnection.upsert({
      where: { gitlabUserId: String(user.id) },
      create: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt,
        gitlabUserId: String(user.id),
        gitlabUsername: user.username,
        instanceUrl: env.gitlabInstanceUrl(),
      },
      update: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt,
        gitlabUsername: user.username,
        instanceUrl: env.gitlabInstanceUrl(),
      },
    });

    const res = NextResponse.redirect(`${env.appUrl()}/projects`);
    res.cookies.set("oxid_oauth_state", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return redirectToError(message);
  }
}

function redirectToError(message: string): NextResponse {
  const url = new URL("/", env.appUrl());
  url.searchParams.set("auth_error", message);
  return NextResponse.redirect(url.toString());
}
