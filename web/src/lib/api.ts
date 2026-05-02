import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return jsonError(err.issues.map((i) => i.message).join("; "), 400);
  }
  if (err instanceof Error) {
    if (err.name === "ConnectionError") {
      return jsonError(err.message, 401);
    }
    return jsonError(err.message, 500);
  }
  return jsonError("Unexpected error", 500);
}

export function parseSummary(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      critical: number;
      high: number;
      medium: number;
      low: number;
      info: number;
      total: number;
      scanners: string[];
    };
  } catch {
    return null;
  }
}

export function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
