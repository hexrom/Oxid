"use client";

import Link from "next/link";
import { Check, Plus, X, AlertTriangle } from "lucide-react";

import { Heatmap, type HeatmapDay, Sparkline } from "@/components/charts";
import { SeverityDot, severityColor } from "@/components/severity-badge";
import {
  SEVERITY_ORDER,
  type Severity,
  type SeveritySummary,
} from "@/lib/types";
import { cn, formatDuration, formatRelative } from "@/lib/utils";

interface DashboardProject {
  id: string;
  name: string;
  nameWithNamespace: string;
  lastScan: string | Date | null;
  summary: SeveritySummary | null;
  trend: number[];
}

interface DashboardActivityEntry {
  project: string;
  kind: "scan_completed" | "scan_failed" | "scan_running";
  when: string;
  summary: SeveritySummary | null;
  durationMs: number | null;
  errorMessage: string | null;
}

export function DashboardView({
  totals,
  projects,
  heatmap,
  activity,
  projectCount,
}: {
  totals: Record<Severity, number> & { total: number };
  projects: DashboardProject[];
  heatmap: HeatmapDay[];
  activity: DashboardActivityEntry[];
  projectCount: number;
}) {
  const lastScan = projects
    .map((p) => p.lastScan)
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .sort((a, b) => b - a)[0];

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">Overview</h1>
          <p className="screen__subtitle">
            <span className="mono">{projectCount}</span> projects
            <span className="dot">·</span>
            <span className="mono">{totals.total}</span> open findings
            <span className="dot">·</span>
            last scan{" "}
            <span className="mono">
              {lastScan ? formatRelative(new Date(lastScan)) : "never"}
            </span>
          </p>
        </div>
        <div className="screen__head-actions">
          <Link href="/projects" className="btn">
            <Plus size={14} /> Import
          </Link>
        </div>
      </header>

      <section className="kpi-row">
        <KpiCard
          label="Open findings"
          value={totals.total}
          accent="var(--accent)"
          trend={projects.flatMap((p) => p.trend).slice(-14)}
        />
        <KpiCard
          label="Critical"
          value={totals.critical}
          accent="var(--sev-crit)"
          trend={[]}
        />
        <KpiCard
          label="High"
          value={totals.high}
          accent="var(--sev-high)"
          trend={[]}
        />
        <KpiCard
          label="Projects"
          value={projectCount}
          accent="var(--text-2)"
          trend={[]}
        />
      </section>

      <section className="card">
        <div className="card__head">
          <div>
            <h2 className="card__title">Severity heatmap</h2>
            <p className="card__sub">
              Last {heatmap.length || 0} scan{heatmap.length === 1 ? "" : "s"} across the org
            </p>
          </div>
          <div className="legend">
            {SEVERITY_ORDER.map((s) => (
              <span key={s} className="legend__item">
                <span
                  className="legend__sw"
                  style={{ background: severityColor(s) }}
                />
                <span>{s}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="card__body">
          <Heatmap days={heatmap} width={1140} height={150} />
        </div>
      </section>

      <section className="dash-grid">
        <div className="card">
          <div className="card__head">
            <div>
              <h2 className="card__title">Projects</h2>
              <p className="card__sub">Click a row to drill in</p>
            </div>
          </div>
          <div className="card__body card__body--flush">
            {projects.length === 0 ? (
              <div className="muted-mono" style={{ padding: 24 }}>
                No projects imported yet. Visit the{" "}
                <Link href="/projects" className="link">
                  Projects
                </Link>{" "}
                page to import one.
              </div>
            ) : (
              <ul className="project-list">
                {projects.map((p) => (
                  <li key={p.id} style={{ listStyle: "none" }}>
                    <Link href={`/projects/${p.id}`} className="project-list__row">
                      <div className="project-list__name">
                        <span className="project-list__title">{p.name}</span>
                        <span className="project-list__path">
                          {p.nameWithNamespace}
                        </span>
                      </div>
                      <div className="project-list__dots">
                        {p.summary ? (
                          SEVERITY_ORDER.map((s) => (
                            <SeverityDot
                              key={s}
                              severity={s}
                              count={p.summary![s]}
                            />
                          ))
                        ) : (
                          <span className="muted-mono">never scanned</span>
                        )}
                      </div>
                      <div>
                        {p.trend.length > 1 ? (
                          <Sparkline values={p.trend} w={92} h={22} />
                        ) : null}
                      </div>
                      <div className="project-list__meta">
                        {p.lastScan ? formatRelative(p.lastScan) : "—"}
                      </div>
                      <span className="project-list__chev mono">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <div>
              <h2 className="card__title">Activity</h2>
              <p className="card__sub">Recent scans</p>
            </div>
          </div>
          <div className="card__body card__body--flush">
            {activity.length === 0 ? (
              <div className="muted-mono" style={{ padding: 24 }}>
                No scan activity yet.
              </div>
            ) : (
              <ul className="activity">
                {activity.map((a, i) => (
                  <li key={i} className="activity__row">
                    <span
                      className={cn(
                        "activity__icon",
                        `activity__icon--${a.kind}`,
                      )}
                    >
                      {a.kind === "scan_completed" ? (
                        <Check size={12} />
                      ) : a.kind === "scan_failed" ? (
                        <X size={12} />
                      ) : (
                        <AlertTriangle size={12} />
                      )}
                    </span>
                    <div>
                      <div className="activity__line">
                        <span className="activity__project">{a.project}</span>
                        <span className="activity__kind">
                          {a.kind.replace("_", " ")}
                        </span>
                      </div>
                      <div className="activity__note">
                        {a.kind === "scan_failed"
                          ? a.errorMessage ?? "scan failed"
                          : a.summary
                            ? `${a.summary.total} finding${a.summary.total === 1 ? "" : "s"}${a.durationMs ? " · " + formatDuration(a.durationMs) : ""}`
                            : "—"}
                      </div>
                    </div>
                    <span className="activity__time">
                      {formatRelative(a.when)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  trend,
}: {
  label: string;
  value: number | string;
  accent: string;
  trend: number[];
}) {
  return (
    <div className="kpi">
      <div className="kpi__row">
        <span className="kpi__label">{label}</span>
      </div>
      <div className="kpi__value" style={{ color: accent }}>
        {value}
      </div>
      {trend.length > 1 ? (
        <Sparkline values={trend} w={180} h={32} stroke={accent} />
      ) : (
        <div style={{ height: 32 }} />
      )}
    </div>
  );
}
