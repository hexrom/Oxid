"use client";

import { ChevronRight, ExternalLink, Search } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { SeverityBadge, severityColor } from "@/components/severity-badge";
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
  const [active, setActive] = useState<Set<Severity>>(
    () => new Set(SEVERITY_ORDER),
  );
  const [query, setQuery] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings
      .filter((f) => active.has(f.severity))
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
  }, [findings, active, query]);

  function toggle(s: Severity) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      if (next.size === 0) return new Set(SEVERITY_ORDER);
      return next;
    });
  }

  return (
    <div className="findings">
      <div className="findings__filters">
        <div className="pills">
          {SEVERITY_ORDER.map((s) => {
            const isOn = active.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={cn("pill", isOn && "is-on")}
                style={{ ["--sev" as never]: severityColor(s) } as CSSProperties}
                aria-pressed={isOn}
              >
                <span className="pill__dot" />
                <span>{s}</span>
                <span
                  className="pill__count"
                  style={
                    isOn
                      ? undefined
                      : { textDecoration: "line-through", opacity: 0.55 }
                  }
                >
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="findings__search">
          <Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by ID, title, package…"
            type="search"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasFindings={findings.length > 0} />
      ) : (
        <div className="findings__table">
          <div className="findings__head">
            <span style={{ width: 28 }} />
            <span style={{ width: 92 }}>Severity</span>
            <span style={{ width: 200 }}>ID</span>
            <span style={{ flex: 1, minWidth: 0 }}>Title</span>
            <span style={{ width: 240 }}>Package</span>
            <span style={{ width: 160 }}>Scanner</span>
          </div>
          {filtered.map((f) => {
            const isOpen = expanded === f.id;
            return (
              <div key={f.id} className={cn("finding", isOpen && "finding--open")}>
                <div
                  className="finding__row"
                  onClick={() => setExpanded(isOpen ? null : f.id)}
                >
                  <span style={{ width: 28 }}>
                    <ChevronRight
                      size={14}
                      className={cn("chev", isOpen && "chev--open")}
                    />
                  </span>
                  <span style={{ width: 92 }}>
                    <SeverityBadge severity={f.severity} />
                  </span>
                  <span
                    style={{ width: 200 }}
                    className="mono dim trunc"
                  >
                    {f.findingId}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }} className="trunc">
                    {f.title}
                  </span>
                  <span
                    style={{ width: 240 }}
                    className="mono dim trunc"
                  >
                    {f.packageName
                      ? `${f.packageName}${f.packageVersion ? "@" + f.packageVersion : ""}`
                      : "—"}
                  </span>
                  <span
                    style={{ width: 160 }}
                    className="mono dim trunc"
                  >
                    {f.sourceScanners.join(", ") || "—"}
                  </span>
                </div>
                {isOpen ? <FindingDetail f={f} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FindingDetail({ f }: { f: FindingRow }) {
  return (
    <div className="finding__detail">
      {f.description ? (
        <DetailRow label="Description">
          <p>{f.description}</p>
        </DetailRow>
      ) : null}
      {f.remediation ? (
        <DetailRow label="Remediation">
          <pre className="mono small">{f.remediation}</pre>
        </DetailRow>
      ) : null}
      {f.filePath ? (
        <DetailRow label="Location">
          <span className="mono small">
            {f.filePath}
            {f.line != null
              ? `:${f.line}${f.column != null ? `:${f.column}` : ""}`
              : ""}
          </span>
        </DetailRow>
      ) : null}
      <DetailRow label="Kind">
        <span className="mono small upper">{f.kind}</span>
      </DetailRow>
      {f.references.length > 0 ? (
        <DetailRow label="References">
          <ul className="refs">
            {f.references.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link mono small"
                >
                  <ExternalLink size={11} /> {url}
                </a>
              </li>
            ))}
          </ul>
        </DetailRow>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="detail-row">
      <div className="detail-row__label">{label}</div>
      <div className="detail-row__body">{children}</div>
    </div>
  );
}

function EmptyState({ hasFindings }: { hasFindings: boolean }) {
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
      <p
        className="mono"
        style={{ color: "var(--text-2)", margin: 0 }}
      >
        {hasFindings ? "No findings match the current filters." : "No findings."}
      </p>
      {!hasFindings ? (
        <p className="small" style={{ color: "var(--text-3)", margin: 0 }}>
          Either this project is clean, or scanners produced nothing yet.
        </p>
      ) : null}
    </div>
  );
}
