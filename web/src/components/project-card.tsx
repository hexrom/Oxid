"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Loader2, MoreHorizontal, Play } from "lucide-react";

import { SEVERITY_ORDER, type SeveritySummary } from "@/lib/types";
import {
  SeverityDot,
  severityColor,
} from "@/components/severity-badge";
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

export function ProjectCard({
  project,
  onRefresh,
}: {
  project: ProjectCardData;
  onRefresh?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
    setMenuOpen(false);
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
      if (onRefresh) await onRefresh();
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
      setRemoving(false);
    }
  }

  const summary = project.latestScan?.summary ?? null;
  const total = summary?.total ?? 0;

  return (
    <Link href={`/projects/${project.id}`} className="proj-card focus-ring">
      <div className="proj-card__head">
        <div
          className="proj-card__name"
          style={{ justifyContent: "space-between" }}
        >
          <span className="proj-card__title">{project.name}</span>
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(project.webUrl, "_blank", "noopener,noreferrer");
              }}
              className="proj-card__vis"
              aria-label="Open in GitLab"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <ExternalLink size={10} /> GitLab
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="btn btn--ghost btn--icon"
              style={{ height: 22, width: 22 }}
              aria-label="More"
            >
              <MoreHorizontal size={14} />
            </button>
          </span>
        </div>
        <span className="proj-card__path">
          {project.nameWithNamespace} · {project.defaultBranch}
        </span>
      </div>

      <div className="proj-card__body">
        {summary ? (
          <>
            <div className="proj-card__total">
              <span className="proj-card__total-num">{total}</span>
              <span className="proj-card__total-lbl">findings</span>
            </div>
            <div className="proj-card__bar">
              {SEVERITY_ORDER.map((sev) => {
                const v = summary[sev];
                if (!v) return null;
                return (
                  <span
                    key={sev}
                    className="proj-card__bar-seg"
                    style={{ flex: v, background: severityColor(sev) }}
                    title={`${sev}: ${v}`}
                  />
                );
              })}
            </div>
            <div className="proj-card__dots">
              {SEVERITY_ORDER.map((sev) => (
                <SeverityDot key={sev} severity={sev} count={summary[sev]} />
              ))}
            </div>
          </>
        ) : (
          <div className="proj-card__never">
            <span>Never scanned</span>
          </div>
        )}
        {error ? (
          <p className="mono small" style={{ color: "var(--err)", margin: 0 }}>
            {error}
          </p>
        ) : null}
      </div>

      <div className="proj-card__foot">
        <span className="proj-card__foot-meta">
          <span>
            {project.latestScan
              ? `${scanStatusLabel(project.latestScan.status)} · ${formatRelative(project.latestScan.completedAt ?? project.latestScan.startedAt)}`
              : "—"}
          </span>
        </span>
        <span style={{ display: "inline-flex", gap: 6 }}>
          {menuOpen ? (
            <button
              type="button"
              onClick={remove}
              disabled={removing}
              className="btn btn--ghost btn--danger"
              style={{ height: 26, fontSize: 11 }}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={startScan}
            disabled={scanning}
            className="btn"
            style={{ height: 26, fontSize: 11 }}
          >
            {scanning ? (
              <>
                <Loader2 size={12} className="spin" /> Starting…
              </>
            ) : (
              <>
                <Play size={12} /> Scan
              </>
            )}
          </button>
        </span>
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
