"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Loader2, Trash2 } from "lucide-react";

import { SEVERITY_ORDER, type SeveritySummary } from "@/lib/types";
import { SeverityDot } from "@/components/severity-badge";
import { formatRelative } from "@/lib/utils";

export interface ProjectCardData {
  id: string;
  name: string;
  nameWithNamespace: string;
  webUrl: string;
  defaultBranch: string;
  latestScan: {
    id: string;
    status: string;
    startedAt: string | Date;
    completedAt: string | Date | null;
    duration: number | null;
    summary: SeveritySummary | null;
  } | null;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startScan(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/scan`, {
        method: "POST",
      });
      const data = (await res.json()) as { scan?: { id: string }; error?: string };
      if (!res.ok || !data.scan) {
        throw new Error(data.error ?? "Failed to start scan");
      }
      router.push(`/projects/${project.id}?scan=${data.scan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start scan");
      setScanning(false);
    }
  }

  async function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Remove ${project.nameWithNamespace}? Scan history will be deleted.`,
      )
    )
      return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove project");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
      setRemoving(false);
    }
  }

  const summary = project.latestScan?.summary ?? null;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4 transition-colors hover:border-borderStrong hover:bg-surfaceAlt focus-ring"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-mono text-sm font-semibold text-text">
            {project.name}
          </h3>
          <a
            href={project.webUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
            aria-label="Open in GitLab"
          >
            <ExternalLink size={12} />
          </a>
        </div>
        <p className="truncate font-mono text-xs text-muted">
          {project.nameWithNamespace} · {project.defaultBranch}
        </p>
        <div className="mt-1 flex items-center gap-4">
          {summary ? (
            <div className="flex items-center gap-3">
              {SEVERITY_ORDER.map((s) => (
                <SeverityDot key={s} severity={s} count={summary[s]} />
              ))}
            </div>
          ) : (
            <span className="font-mono text-xs text-muted">Never scanned</span>
          )}
          {project.latestScan ? (
            <span className="font-mono text-xs text-muted">
              {scanStatusLabel(project.latestScan.status)} ·{" "}
              {formatRelative(project.latestScan.completedAt ?? project.latestScan.startedAt)}
            </span>
          ) : null}
        </div>
        {error ? (
          <p className="font-mono text-xs text-red-400">{error}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          className="btn-ghost"
          aria-label="Remove project"
        >
          <Trash2 size={14} />
        </button>
        <button
          type="button"
          onClick={startScan}
          disabled={scanning}
          className="btn-secondary"
        >
          {scanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Starting…
            </>
          ) : (
            "Scan"
          )}
        </button>
      </div>
    </Link>
  );
}

function scanStatusLabel(status: string): string {
  switch (status) {
    case "running":
      return "Running";
    case "pending":
      return "Pending";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}
