"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import { SeverityBadge } from "@/components/severity-badge";
import {
  SEVERITY_ORDER,
  SEVERITY_RANK,
  type Severity,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export interface FindingRow {
  id: string;
  findingId: string;
  title: string;
  description: string | null;
  severity: Severity;
  kind: string;
  packageName: string | null;
  packageVersion: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  remediation: string | null;
  references: string[];
  sourceScanners: string[];
}

export function FindingsTable({ findings }: { findings: FindingRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeSeverities, setActiveSeverities] = useState<
    Set<Severity> | "all"
  >("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings
      .filter((f) =>
        activeSeverities === "all"
          ? true
          : activeSeverities.has(f.severity),
      )
      .filter((f) => {
        if (!q) return true;
        return (
          f.findingId.toLowerCase().includes(q) ||
          f.title.toLowerCase().includes(q) ||
          (f.packageName ?? "").toLowerCase().includes(q) ||
          (f.packageVersion ?? "").toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
          a.findingId.localeCompare(b.findingId),
      );
  }, [findings, activeSeverities, query]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  function toggleSeverity(s: Severity) {
    setActiveSeverities((prev) => {
      const set =
        prev === "all"
          ? new Set<Severity>(SEVERITY_ORDER)
          : new Set<Severity>(prev);
      if (set.has(s)) set.delete(s);
      else set.add(s);
      if (set.size === 0 || set.size === SEVERITY_ORDER.length) return "all";
      return set;
    });
  }

  function isActive(s: Severity): boolean {
    return activeSeverities === "all" ? true : activeSeverities.has(s);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {SEVERITY_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSeverity(s)}
              className={cn(
                "inline-flex items-center gap-2 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors focus-ring",
                isActive(s)
                  ? "border-borderStrong bg-surfaceAlt text-text"
                  : "border-border bg-transparent text-muted hover:text-textDim",
              )}
              aria-pressed={isActive(s)}
            >
              <SeverityBadge severity={s} className="border-transparent bg-transparent !px-0 !py-0" />
              <span className="text-textDim">{counts[s]}</span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by ID, title, package…"
          className="input max-w-xs font-mono"
          type="search"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasFindings={findings.length > 0} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="bg-surfaceAlt text-left text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="w-[34px] px-3 py-2"></th>
                <th className="w-[88px] px-3 py-2">Severity</th>
                <th className="w-[180px] px-3 py-2">ID</th>
                <th className="px-3 py-2">Title</th>
                <th className="w-[220px] px-3 py-2">Package</th>
                <th className="w-[160px] px-3 py-2">Scanner</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const isOpen = expanded === f.id;
                return (
                  <FindingRowView
                    key={f.id}
                    finding={f}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : f.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FindingRowView({
  finding,
  isOpen,
  onToggle,
}: {
  finding: FindingRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const pkg =
    finding.packageName != null
      ? `${finding.packageName}${finding.packageVersion ? `@${finding.packageVersion}` : ""}`
      : "—";

  return (
    <>
      <tr
        className="cursor-pointer border-t border-border hover:bg-surfaceAlt/50"
        onClick={onToggle}
      >
        <td className="px-3 py-2 align-top">
          <ChevronRight
            size={14}
            className={cn(
              "text-muted transition-transform",
              isOpen && "rotate-90 text-textDim",
            )}
          />
        </td>
        <td className="px-3 py-2 align-top">
          <SeverityBadge severity={finding.severity} />
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs text-textDim">
          {finding.findingId}
        </td>
        <td className="px-3 py-2 align-top text-text">
          <span className="line-clamp-1">{finding.title}</span>
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs text-textDim">
          <span className="line-clamp-1">{pkg}</span>
        </td>
        <td className="px-3 py-2 align-top font-mono text-xs text-muted">
          <span className="line-clamp-1">
            {finding.sourceScanners.join(", ") || "—"}
          </span>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-t border-border bg-surfaceAlt/30">
          <td colSpan={6} className="px-6 py-4">
            <FindingDetail finding={finding} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FindingDetail({ finding }: { finding: FindingRow }) {
  return (
    <div className="grid gap-4 text-sm leading-relaxed text-textDim">
      {finding.description ? (
        <Section label="Description">
          <p className="whitespace-pre-wrap text-text">
            {finding.description}
          </p>
        </Section>
      ) : null}
      {finding.remediation ? (
        <Section label="Remediation">
          <p className="whitespace-pre-wrap font-mono text-xs text-text">
            {finding.remediation}
          </p>
        </Section>
      ) : null}
      {finding.filePath ? (
        <Section label="Location">
          <p className="font-mono text-xs text-text">
            {finding.filePath}
            {finding.line != null
              ? `:${finding.line}${finding.column != null ? `:${finding.column}` : ""}`
              : ""}
          </p>
        </Section>
      ) : null}
      <Section label="Kind">
        <span className="font-mono text-xs uppercase tracking-wider text-text">
          {finding.kind}
        </span>
      </Section>
      {finding.references.length > 0 ? (
        <Section label="References">
          <ul className="flex flex-col gap-1.5">
            {finding.references.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 font-mono text-xs text-oxide hover:underline"
                >
                  <ExternalLink size={12} />
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4">
      <div className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyState({ hasFindings }: { hasFindings: boolean }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="font-mono text-sm text-textDim">
        {hasFindings ? "No findings match the current filters." : "No findings."}
      </p>
      {!hasFindings ? (
        <p className="text-xs text-muted">
          Either this project is clean, or scanners produced nothing yet.
        </p>
      ) : null}
    </div>
  );
}
