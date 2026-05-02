"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type FindingRow,
  FindingsTable,
} from "@/components/findings-table";
import { ScanSummaryBar } from "@/components/scan-summary";
import type { SeveritySummary } from "@/lib/types";
import { cn, formatAbsolute, formatDuration, formatRelative } from "@/lib/utils";

interface ProjectMeta {
  id: string;
  name: string;
  nameWithNamespace: string;
  defaultBranch: string;
  webUrl: string;
}

interface ScanMeta {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  branch: string;
  commitSha: string | null;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  summary: SeveritySummary | null;
  errorMessage: string | null;
}

interface ProjectResponse {
  project: ProjectMeta;
  scans: ScanMeta[];
}

interface ScanDetailResponse {
  scan: ScanMeta;
  findings: FindingRow[];
}

const POLL_INTERVAL = 3000;

export function ProjectDetailView({
  projectId,
  initialScanId,
}: {
  projectId: string;
  initialScanId: string | null;
}) {
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [scans, setScans] = useState<ScanMeta[] | null>(null);
  const [activeScanId, setActiveScanId] = useState<string | null>(initialScanId);
  const [scanDetail, setScanDetail] = useState<ScanDetailResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProject = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      const data = (await res.json()) as ProjectResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load project");
      setProject(data.project);
      setScans(data.scans);
      if (!activeScanId && data.scans.length > 0) {
        setActiveScanId(data.scans[0].id);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [projectId, activeScanId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const loadScanDetail = useCallback(async (scanId: string) => {
    const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
    const data = (await res.json()) as ScanDetailResponse & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Failed to load scan");
    return data;
  }, []);

  useEffect(() => {
    if (!activeScanId) {
      setScanDetail(null);
      return;
    }
    let cancelled = false;

    async function tick(scanId: string) {
      try {
        const data = await loadScanDetail(scanId);
        if (cancelled) return;
        setScanDetail(data);
        setScans((prev) => {
          if (!prev) return prev;
          const idx = prev.findIndex((s) => s.id === data.scan.id);
          if (idx === -1) return [data.scan, ...prev];
          const next = [...prev];
          next[idx] = data.scan;
          return next;
        });
        if (data.scan.status === "running" || data.scan.status === "pending") {
          pollRef.current = setTimeout(() => void tick(scanId), POLL_INTERVAL);
        }
      } catch (err) {
        if (cancelled) return;
        setScanError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    void tick(activeScanId);

    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [activeScanId, loadScanDetail]);

  async function startScan() {
    setStarting(true);
    setScanError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/scan`, {
        method: "POST",
      });
      const data = (await res.json()) as { scan?: { id: string }; error?: string };
      if (!res.ok || !data.scan) {
        throw new Error(data.error ?? "Failed to start scan");
      }
      setActiveScanId(data.scan.id);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Failed to start scan");
    } finally {
      setStarting(false);
    }
  }

  const isScanning = useMemo(() => {
    const s = scanDetail?.scan ?? scans?.find((x) => x.id === activeScanId);
    return s?.status === "running" || s?.status === "pending";
  }, [scanDetail, scans, activeScanId]);

  if (loadError) {
    return (
      <div className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs text-red-300">
        {loadError}
      </div>
    );
  }

  if (!project || scans === null) {
    return <ProjectDetailSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-textDim"
        >
          <ArrowLeft size={12} />
          All projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-mono text-xl font-semibold text-text">
              {project.name}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span className="font-mono">{project.nameWithNamespace}</span>
              <span>·</span>
              <span className="font-mono">{project.defaultBranch}</span>
              <span>·</span>
              <a
                href={project.webUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-textDim"
              >
                GitLab <ExternalLink size={11} />
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={startScan}
            disabled={starting || isScanning}
            className="btn-primary"
          >
            {starting || isScanning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {isScanning ? "Scanning…" : "Starting…"}
              </>
            ) : (
              <>
                <Play size={14} />
                Scan now
              </>
            )}
          </button>
        </div>
      </div>

      {scanError ? (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs text-red-300">
          {scanError}
        </div>
      ) : null}

      <ActiveScanPanel
        scanDetail={scanDetail}
        isScanning={isScanning}
        scans={scans}
        activeScanId={activeScanId}
        onSelect={setActiveScanId}
      />

      <ScanHistory
        scans={scans}
        activeScanId={activeScanId}
        onSelect={setActiveScanId}
      />
    </div>
  );
}

function ActiveScanPanel({
  scanDetail,
  isScanning,
  scans,
  activeScanId,
  onSelect,
}: {
  scanDetail: ScanDetailResponse | null;
  isScanning: boolean;
  scans: ScanMeta[];
  activeScanId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!activeScanId) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <p className="font-mono text-sm text-textDim">
          No scans yet. Click <span className="text-text">Scan now</span> to run
          one.
        </p>
        <p className="text-xs text-muted">
          The repo is cloned to a temp directory, scanned, and removed when
          done.
        </p>
      </div>
    );
  }

  if (!scanDetail) {
    return <FindingsSkeleton />;
  }

  const { scan, findings } = scanDetail;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs">
          <ScanStatusBadge status={scan.status} />
          <span className="font-mono text-textDim">
            {formatAbsolute(scan.startedAt)}
          </span>
          {scan.commitSha ? (
            <span className="font-mono text-muted">
              {scan.commitSha.slice(0, 8)}
            </span>
          ) : null}
        </div>
        {scans.length > 1 ? (
          <ScanSelect
            scans={scans}
            value={activeScanId}
            onChange={onSelect}
          />
        ) : null}
      </div>

      {scan.status === "failed" && scan.errorMessage ? (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs text-red-300">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-red-400">
            Scan failed
          </div>
          <pre className="whitespace-pre-wrap break-words">
            {scan.errorMessage}
          </pre>
        </div>
      ) : null}

      <ScanSummaryBar summary={scan.summary} duration={scan.duration} />

      {isScanning ? (
        <FindingsSkeleton scanning />
      ) : (
        <FindingsTable findings={findings} />
      )}
    </div>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-neutral-700 bg-neutral-800/50 text-neutral-300",
    running: "border-oxide/40 bg-oxide/10 text-oxide",
    completed: "border-emerald-800/60 bg-emerald-900/30 text-emerald-300",
    failed: "border-red-800/70 bg-red-900/30 text-red-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        map[status] ?? "border-border bg-surface text-textDim",
      )}
    >
      {status === "running" ? (
        <Loader2 size={10} className="animate-spin" />
      ) : null}
      {status}
    </span>
  );
}

function ScanSelect({
  scans,
  value,
  onChange,
}: {
  scans: ScanMeta[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input max-w-xs font-mono text-xs"
    >
      {scans.map((s) => (
        <option key={s.id} value={s.id}>
          {formatRelative(s.completedAt ?? s.startedAt)} · {s.status}
          {s.summary ? ` · ${s.summary.total}` : ""}
        </option>
      ))}
    </select>
  );
}

function ScanHistory({
  scans,
  activeScanId,
  onSelect,
}: {
  scans: ScanMeta[];
  activeScanId: string | null;
  onSelect: (id: string) => void;
}) {
  if (scans.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-mono text-xs uppercase tracking-wider text-muted">
        Scan history
      </h2>
      <div className="card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-surfaceAlt text-left text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="w-[110px] px-3 py-2">Status</th>
              <th className="px-3 py-2">Started</th>
              <th className="w-[100px] px-3 py-2">Duration</th>
              <th className="w-[120px] px-3 py-2">Findings</th>
              <th className="w-[120px] px-3 py-2">Commit</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((s) => {
              const isActive = s.id === activeScanId;
              return (
                <tr
                  key={s.id}
                  className={cn(
                    "cursor-pointer border-t border-border hover:bg-surfaceAlt/50",
                    isActive && "bg-surfaceAlt/40",
                  )}
                  onClick={() => onSelect(s.id)}
                >
                  <td className="px-3 py-2">
                    <ScanStatusBadge status={s.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-textDim">
                    {formatAbsolute(s.startedAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-textDim">
                    {formatDuration(s.duration)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-textDim">
                    {s.summary ? s.summary.total : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {s.commitSha ? s.commitSha.slice(0, 8) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 animate-pulse rounded bg-surface" />
        <div className="h-7 w-64 animate-pulse rounded bg-surface" />
        <div className="h-3 w-80 animate-pulse rounded bg-surface" />
      </div>
      <FindingsSkeleton />
    </div>
  );
}

function FindingsSkeleton({ scanning }: { scanning?: boolean } = {}) {
  return (
    <div className="card flex flex-col gap-3 p-6">
      <div className="flex items-center gap-3">
        {scanning ? (
          <>
            <Loader2 size={14} className="animate-spin text-oxide" />
            <span className="font-mono text-xs text-textDim">
              Cloning, running scanners…
            </span>
          </>
        ) : (
          <RefreshCw size={14} className="animate-spin text-muted" />
        )}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-9 animate-pulse rounded bg-surfaceAlt/50"
          />
        ))}
      </div>
    </div>
  );
}
