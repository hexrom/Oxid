import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const SEVERITY_VAR: Record<Severity, string> = {
  critical: "var(--sev-crit)",
  high: "var(--sev-high)",
  medium: "var(--sev-med)",
  low: "var(--sev-low)",
  info: "var(--sev-info)",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO",
};

export function severityColor(s: Severity): string {
  return SEVERITY_VAR[s];
}

export function SeverityBadge({
  severity,
  dim,
  className,
}: {
  severity: Severity;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("sev-badge", className)}
      style={
        {
          "--sev": SEVERITY_VAR[severity],
          opacity: dim ? 0.55 : 1,
        } as CSSProperties
      }
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function SeverityDot({
  severity,
  count,
}: {
  severity: Severity;
  count: number;
}) {
  const empty = !count;
  return (
    <span className="sev-dot" title={`${SEVERITY_LABEL[severity]}: ${count}`}>
      <span
        className="sev-dot__mark"
        style={{
          background: empty ? "var(--border)" : SEVERITY_VAR[severity],
          boxShadow: empty
            ? "none"
            : `0 0 0 2px color-mix(in oklab, ${SEVERITY_VAR[severity]} 18%, transparent)`,
        }}
      />
      <span className={empty ? "sev-dot__count is-empty" : "sev-dot__count"}>
        {count}
      </span>
    </span>
  );
}

export { SEVERITY_LABEL, SEVERITY_VAR };
