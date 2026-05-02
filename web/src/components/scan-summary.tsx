import { SEVERITY_ORDER, type SeveritySummary } from "@/lib/types";
import { SeverityDot } from "@/components/severity-badge";
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
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-surface px-4 py-3 text-sm">
      <div className="flex items-center gap-4">
        {SEVERITY_ORDER.map((s) => (
          <SeverityDot key={s} severity={s} count={summary[s]} />
        ))}
      </div>
      <div className="flex items-center gap-3 text-xs text-textDim">
        <Separator />
        <span className="font-mono">
          <span className="text-text">{summary.total}</span> total
        </span>
        {scannerCount > 0 ? (
          <>
            <Separator />
            <span className="font-mono">
              <span className="text-text">{scannerCount}</span> scanner
              {scannerCount === 1 ? "" : "s"}
            </span>
          </>
        ) : null}
        {duration != null ? (
          <>
            <Separator />
            <span className="font-mono">{formatDuration(duration)}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Separator() {
  return <span className="text-borderStrong">·</span>;
}
