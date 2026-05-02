import { SEVERITY_ORDER, type SeveritySummary } from "@/lib/types";
import { SeverityDot, severityColor } from "@/components/severity-badge";
import { formatDuration } from "@/lib/utils";

export function ScanSummaryBar({
  summary,
  duration,
}: {
  summary: SeveritySummary | null;
  duration?: number | null;
}) {
  if (!summary) return null;
  const scannerCount = summary.scanners.length;
  return (
    <div className="scan-done__bar">
      <div className="scan-done__dots">
        {SEVERITY_ORDER.map((s) => (
          <SeverityDot key={s} severity={s} count={summary[s]} />
        ))}
      </div>
      <div className="scan-done__sep" />
      <span className="mono dim">
        <span className="bright">{summary.total}</span> total
      </span>
      {scannerCount > 0 ? (
        <>
          <div className="scan-done__sep" />
          <span className="mono dim">
            <span className="bright">{scannerCount}</span> scanner
            {scannerCount === 1 ? "" : "s"}
          </span>
        </>
      ) : null}
      {duration != null ? (
        <>
          <div className="scan-done__sep" />
          <span className="mono dim">{formatDuration(duration)}</span>
        </>
      ) : null}
    </div>
  );
}

export function SeverityTiles({ summary }: { summary: SeveritySummary | null }) {
  if (!summary) return null;
  return (
    <div className="sev-tiles">
      {SEVERITY_ORDER.map((s) => (
        <div
          key={s}
          className="sev-tile"
          style={{ ["--sev" as never]: severityColor(s) } as React.CSSProperties}
        >
          <span className="sev-tile__label">{s}</span>
          <span className="sev-tile__value">{summary[s]}</span>
        </div>
      ))}
    </div>
  );
}
