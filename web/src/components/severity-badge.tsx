import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: "bg-red-950/60 text-red-300 border-red-900/80",
  high: "bg-orange-950/60 text-orange-300 border-orange-900/80",
  medium: "bg-yellow-950/60 text-yellow-300 border-yellow-900/80",
  low: "bg-blue-950/60 text-blue-300 border-blue-900/80",
  info: "bg-neutral-800/60 text-neutral-400 border-neutral-700",
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        SEVERITY_STYLES[severity],
        className,
      )}
    >
      {severity}
    </span>
  );
}

const DOT_STYLES: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
  info: "bg-neutral-500",
};

export function SeverityDot({
  severity,
  count,
}: {
  severity: Severity;
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-textDim">
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          count > 0 ? DOT_STYLES[severity] : "bg-neutral-800",
        )}
      />
      <span className={count > 0 ? "text-text" : "text-muted"}>{count}</span>
    </span>
  );
}
