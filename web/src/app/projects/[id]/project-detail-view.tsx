"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Play,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type FindingRow,
  FindingsTable,
} from "@/components/findings-table";
import {
  ScanSummaryBar,
  SeverityTiles,
} from "@/components/scan-summary";
import type { SeveritySummary } from "@/lib/types";
import {
  cn,
  formatAbsolute,
  formatDuration,
  formatRelative,
} from "@/lib/utils";

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

const SCANNER_STAGES = [
  { key: "sbom", label: "sbom" },
  { key: "advisories", label: "advisories" },
  { key: "lints", label: "lints" },
  { key: "policy", label: "policy" },
  { key: "unsafe-audit", label: "unsafe-audit" },
];

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
      <div className="screen">
        <div
          className="mono small"
          style={{
            color: "var(--err)",
            border: "1px solid color-mix(in oklab, var(--err) 30%, transparent)",
            background: "color-mix(in oklab, var(--err) 8%, var(--bg-1))",
            padding: "12px 14px",
            borderRadius: 6,
          }}
        >
          {loadError}
        </div>
      </div>
    );
  }

  if (!project || scans === null) {
    return <ProjectDetailSkeleton />;
  }

  const activeScan =
    scanDetail?.scan ?? scans.find((s) => s.id === activeScanId) ?? null;

  return (
    <div className="screen">
      <div className="crumb">
        <Link href="/projects" className="crumb__back">
          <ArrowLeft size={12} /> All projects
        </Link>
      </div>

      <header className="screen__head">
        <div style={{ minWidth: 0 }}>
          <h1 className="screen__title">
            {project.name}
            <span className="screen__title-tag">{project.defaultBranch}</span>
          </h1>
          <p className="screen__subtitle">
            <span className="mono">{project.nameWithNamespace}</span>
            <span className="dot">·</span>
            <a
              href={project.webUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="link"
            >
              GitLab <ExternalLink size={11} />
            </a>
            {activeScan?.commitSha ? (
              <>
                <span className="dot">·</span>
                <span className="mono">
                  {activeScan.commitSha.slice(0, 8)}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="screen__head-actions">
          <button
            type="button"
            onClick={startScan}
            disabled={starting || isScanning}
            className="btn btn--primary"
          >
            {starting || isScanning ? (
              <>
                <Loader2 size={14} className="spin" />
                {isScanning ? "Scanning…" : "Starting…"}
              </>
            ) : (
              <>
                <Play size={14} /> Scan now
              </>
            )}
          </button>
        </div>
      </header>

      {scanError ? (
        <div
          className="mono small"
          style={{
            color: "var(--err)",
            border: "1px solid color-mix(in oklab, var(--err) 30%, transparent)",
            background: "color-mix(in oklab, var(--err) 8%, var(--bg-1))",
            padding: "10px 12px",
            borderRadius: 6,
          }}
        >
          {scanError}
        </div>
      ) : null}

      {activeScan?.summary ? (
        <SeverityTiles summary={activeScan.summary} />
      ) : null}

      <ActiveScanPanel
        scanDetail={scanDetail}
        isScanning={isScanning}
        activeScan={activeScan}
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
  activeScan,
}: {
  scanDetail: ScanDetailResponse | null;
  isScanning: boolean;
  activeScan: ScanMeta | null;
}) {
  if (!activeScan) {
    return (
      <div
        className="card"
        style={{
          padding: "60px 24px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
        }}
      >
        <p className="mono" style={{ margin: 0, color: "var(--text-2)" }}>
          No scans yet. Click <span style={{ color: "var(--text)" }}>Scan now</span>{" "}
          to run one.
        </p>
        <p className="small" style={{ margin: 0, color: "var(--text-3)" }}>
          The repo is cloned to a temp directory, scanned, and removed when done.
        </p>
      </div>
    );
  }

  if (isScanning) {
    return <LiveScanPanel scan={activeScan} />;
  }

  if (!scanDetail) {
    return <FindingsSkeleton />;
  }

  const { scan, findings } = scanDetail;
  return (
    <div className="scan-done">
      {scan.status === "failed" && scan.errorMessage ? (
        <div
          className="mono small"
          style={{
            color: "var(--err)",
            border: "1px solid color-mix(in oklab, var(--err) 30%, transparent)",
            background: "color-mix(in oklab, var(--err) 8%, var(--bg-1))",
            padding: "12px 14px",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          <div className="upper" style={{ marginBottom: 4 }}>
            Scan failed
          </div>
          {scan.errorMessage}
        </div>
      ) : null}

      <ScanSummaryBar summary={scan.summary} duration={scan.duration} />

      <FindingsTable findings={findings} />
    </div>
  );
}

function LiveScanPanel({ scan }: { scan: ScanMeta }) {
  const startedAt = new Date(scan.startedAt).getTime();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = Math.max(0, now - startedAt);
  // Estimate completion at ~45s; clamp.
  const estimatedTotal = 45_000;
  const progress = Math.min(1, elapsedMs / estimatedTotal);
  const stagesDone = Math.floor(progress * SCANNER_STAGES.length);

  return (
    <section className="scan-live">
      <div className="scan-live__head">
        <div className="scan-live__title">
          <span className="pulse" />
          <span>Scan in progress</span>
          <span className="mono dim">
            · {(elapsedMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>
      <div className="scan-live__body">
        <div className="scan-live__stages">
          {SCANNER_STAGES.map((s, i) => {
            const status: "queued" | "running" | "done" =
              i < stagesDone ? "done" : i === stagesDone ? "running" : "queued";
            const pct =
              status === "done"
                ? 1
                : status === "queued"
                  ? 0
                  : Math.max(
                      0,
                      Math.min(1, progress * SCANNER_STAGES.length - i),
                    );
            return (
              <div key={s.key} className={`stage stage--${status}`}>
                <div className="stage__row">
                  <span className="stage__name">{s.label}</span>
                  <span className="stage__status">
                    {status === "queued" ? (
                      "queued"
                    ) : status === "running" ? (
                      <>
                        <Loader2 size={11} className="spin" /> {Math.round(pct * 100)}%
                      </>
                    ) : (
                      <>
                        <Check size={11} /> done
                      </>
                    )}
                  </span>
                </div>
                <div className="stage__bar">
                  <span
                    className="stage__bar-fill"
                    style={{ width: `${(pct * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="scan-live__term">
          <div className="term-line term-line--info">
            <span className="term-line__t">0000</span>
            <span className="term-line__sym">·</span>
            <span className="term-line__scanner">[oxid]</span>
            <span className="term-line__text">
              cloning {scan.branch}
              {scan.commitSha ? ` @ ${scan.commitSha.slice(0, 8)}` : ""}…
            </span>
          </div>
          <div className="term-line term-line--info">
            <span className="term-line__t">{Math.round(elapsedMs).toString().padStart(4, "0")}</span>
            <span className="term-line__sym">·</span>
            <span className="term-line__scanner">[{SCANNER_STAGES[Math.min(stagesDone, SCANNER_STAGES.length - 1)].key}]</span>
            <span className="term-line__text">
              running… stage {Math.min(stagesDone + 1, SCANNER_STAGES.length)} of {SCANNER_STAGES.length}
            </span>
          </div>
          <div className="term-cursor">█</div>
        </div>
      </div>
    </section>
  );
}

function ScanStatusChip({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "chip chip--ok"
      : status === "failed"
        ? "chip chip--err"
        : status === "running" || status === "pending"
          ? "chip chip--accent"
          : "chip";
  return (
    <span className={cls}>
      {status === "completed" ? (
        <Check size={11} />
      ) : status === "failed" ? (
        <X size={11} />
      ) : status === "running" || status === "pending" ? (
        <Loader2 size={11} className="spin" />
      ) : null}
      {status}
    </span>
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
    <section className="history">
      <h2 className="history__title">Scan history</h2>
      <div className="history__table">
        <div className="history__head">
          <span style={{ width: 110 }}>Status</span>
          <span style={{ flex: 1, minWidth: 0 }}>Started</span>
          <span style={{ width: 110 }}>Duration</span>
          <span style={{ width: 110 }}>Findings</span>
          <span style={{ width: 110 }}>Commit</span>
        </div>
        {scans.map((s) => (
          <div
            key={s.id}
            className={cn(
              "history__row",
              s.id === activeScanId && "is-active",
            )}
            onClick={() => onSelect(s.id)}
          >
            <span style={{ width: 110 }}>
              <ScanStatusChip status={s.status} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }} className="mono small dim">
              {formatAbsolute(s.startedAt)}
            </span>
            <span style={{ width: 110 }} className="mono small dim">
              {formatDuration(s.duration)}
            </span>
            <span style={{ width: 110 }} className="mono small">
              {s.summary ? s.summary.total : <span className="dim">—</span>}
            </span>
            <span style={{ width: 110 }} className="mono small dim">
              {s.commitSha ? s.commitSha.slice(0, 8) : "—"}
            </span>
          </div>
        ))}
      </div>
      <p className="small" style={{ color: "var(--text-3)", margin: 0 }}>
        Last scan {scans[0] ? formatRelative(scans[0].completedAt ?? scans[0].startedAt) : "—"}
      </p>
    </section>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="screen">
      <div
        className="card"
        style={{ height: 100, opacity: 0.5 }}
        aria-hidden
      />
      <FindingsSkeleton />
    </div>
  );
}

function FindingsSkeleton() {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          color: "var(--text-3)",
        }}
      >
        <Loader2 size={14} className="spin" />
        <span className="mono small">Loading findings…</span>
      </div>
    </div>
  );
}
