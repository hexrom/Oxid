import { env } from "@/lib/env";
import type { GitlabProjectSummary } from "@/lib/types";

export interface GitlabTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in?: number;
  created_at?: number;
  scope?: string;
}

export interface GitlabUser {
  id: number;
  username: string;
  name: string;
  email?: string;
}

export class GitlabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const GITLAB_SCOPES = "read_user read_api read_repository";

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(`${env.gitlabInstanceUrl()}/oauth/authorize`);
  url.searchParams.set("client_id", env.gitlabAppId());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GITLAB_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export function redirectUri(): string {
  return `${env.appUrl()}/api/auth/gitlab/callback`;
}

export async function exchangeCodeForToken(
  code: string,
): Promise<GitlabTokenResponse> {
  const res = await fetch(`${env.gitlabInstanceUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.gitlabAppId(),
      client_secret: env.gitlabAppSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GitlabApiError(
      `Token exchange failed: ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as GitlabTokenResponse;
}

export async function refreshToken(
  refresh: string,
): Promise<GitlabTokenResponse> {
  const res = await fetch(`${env.gitlabInstanceUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.gitlabAppId(),
      client_secret: env.gitlabAppSecret(),
      refresh_token: refresh,
      grant_type: "refresh_token",
      redirect_uri: redirectUri(),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new GitlabApiError(`Token refresh failed: ${res.status}`, res.status);
  }
  return (await res.json()) as GitlabTokenResponse;
}

async function gitlabFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${env.gitlabInstanceUrl()}/api/v4${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  return res;
}

export async function fetchCurrentUser(
  accessToken: string,
): Promise<GitlabUser> {
  const res = await gitlabFetch(accessToken, "/user");
  if (!res.ok) {
    throw new GitlabApiError(
      `Failed to fetch GitLab user: ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as GitlabUser;
}

export interface ListProjectsOptions {
  search?: string;
  page?: number;
  perPage?: number;
  /** When true, restrict to projects with Rust as the primary programming language. */
  rustOnly?: boolean;
}

export interface ListProjectsResult {
  projects: GitlabProjectSummary[];
  nextPage: number | null;
}

export async function listMembershipProjects(
  accessToken: string,
  opts: ListProjectsOptions = {},
): Promise<ListProjectsResult> {
  const params = new URLSearchParams({
    membership: "true",
    order_by: "last_activity_at",
    sort: "desc",
    per_page: String(opts.perPage ?? 50),
    page: String(opts.page ?? 1),
    simple: "false",
  });
  if (opts.search) params.set("search", opts.search);
  if (opts.rustOnly) params.set("with_programming_language", "Rust");
  const res = await gitlabFetch(accessToken, `/projects?${params.toString()}`);
  if (!res.ok) {
    throw new GitlabApiError(
      `Failed to list GitLab projects: ${res.status}`,
      res.status,
    );
  }
  const projects = (await res.json()) as GitlabProjectSummary[];
  const nextHeader = res.headers.get("x-next-page");
  const nextPage = nextHeader && nextHeader.length > 0 ? Number(nextHeader) : null;
  return { projects, nextPage: Number.isFinite(nextPage) ? nextPage : null };
}

/**
 * Build an authenticated clone URL. NEVER include the result of this in any
 * response, log, or error message — it carries the OAuth token in plaintext.
 */
export function buildAuthedCloneUrl(
  httpUrlToRepo: string,
  accessToken: string,
): string {
  const url = new URL(httpUrlToRepo);
  url.username = "oauth2";
  url.password = accessToken;
  return url.toString();
}

/** Strip an OAuth token from any string before logging or returning to the user. */
export function redactToken(s: string, accessToken: string): string {
  if (!accessToken) return s;
  return s.split(accessToken).join("[REDACTED]");
}
