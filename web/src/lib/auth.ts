import { prisma } from "@/lib/db";
import type { GitlabConnection } from "@prisma/client";

/**
 * Single-user mode: there is at most one GitlabConnection row.
 * Returns null if none exists.
 */
export async function getActiveConnection(): Promise<GitlabConnection | null> {
  return prisma.gitlabConnection.findFirst({
    orderBy: { updatedAt: "desc" },
  });
}

export async function requireConnection(): Promise<GitlabConnection> {
  const conn = await getActiveConnection();
  if (!conn) {
    throw new ConnectionError("No GitLab connection. Connect first.");
  }
  return conn;
}

export class ConnectionError extends Error {
  readonly code = "no_connection";
}
