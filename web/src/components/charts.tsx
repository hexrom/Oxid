import { SEVERITY_ORDER, type Severity } from "@/lib/types";
import { severityColor } from "@/components/severity-badge";

export function Sparkline({
  values,
  w = 120,
  h = 28,
  stroke = "var(--accent)",
  fill = true,
}: {
  values: number[];
  w?: number;
  h?: number;
  stroke?: string;
  fill?: boolean;
}) {
  if (!values || values.length === 0) {
    return <div style={{ width: w, height: h }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = w / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y] as const;
  });
  const d = points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const fillD = `${d} L${w} ${h} L0 ${h} Z`;
  const last = points[points.length - 1];
  return (
    <svg width={w} height={h} className="sparkline" aria-hidden="true">
      {fill ? <path d={fillD} fill={stroke} opacity="0.12" /> : null}
      <path
        d={d}
        stroke={stroke}
        strokeWidth="1.25"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill={stroke} />
    </svg>
  );
}

export interface HeatmapDay {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export function Heatmap({
  days,
  width = 1140,
  height = 150,
}: {
  days: HeatmapDay[];
  width?: number;
  height?: number;
}) {
  const cols = days.length;
  const rows = SEVERITY_ORDER.length;
  if (cols === 0) {
    return (
      <div className="dim mono small" style={{ padding: "32px 0" }}>
        Not enough scan history to render a heatmap yet.
      </div>
    );
  }
  const labelW = 68;
  const cellW = (width - labelW - 4) / cols;
  const cellH = (height - 18) / rows;
  const max: Record<Severity, number> = {
    critical: 1,
    high: 1,
    medium: 1,
    low: 1,
    info: 1,
  };
  for (const s of SEVERITY_ORDER) {
    max[s] = Math.max(1, ...days.map((d) => d[s] ?? 0));
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="heatmap"
      role="img"
      aria-label="Findings heatmap"
    >
      {SEVERITY_ORDER.map((sev, r) => (
        <g key={sev}>
          <text x="4" y={r * cellH + cellH / 2 + 14} className="heatmap__row-label">
            {sev}
          </text>
          {days.map((d, c) => {
            const v = d[sev] ?? 0;
            const intensity = v / max[sev];
            return (
              <rect
                key={c}
                x={labelW + c * cellW}
                y={r * cellH + 4}
                width={cellW - 2}
                height={cellH - 4}
                rx="2"
                fill={`color-mix(in oklab, ${severityColor(sev)} ${(8 + intensity * 80).toFixed(0)}%, var(--bg-2))`}
                stroke={`color-mix(in oklab, ${severityColor(sev)} ${(intensity * 30).toFixed(0)}%, transparent)`}
                strokeWidth="1"
              >
                <title>{`${d.date} · ${sev}: ${v}`}</title>
              </rect>
            );
          })}
        </g>
      ))}
      {days.map((d, c) => {
        if (c % 2 !== 0) return null;
        return (
          <text
            key={c}
            x={labelW + c * cellW + (cellW - 2) / 2}
            y={height - 2}
            textAnchor="middle"
            className="heatmap__col-label"
          >
            {d.date.replace(/^[A-Z][a-z]+ /, "")}
          </text>
        );
      })}
    </svg>
  );
}

export function ScannerChip({ name }: { name: string }) {
  return (
    <span className="scanner-chip">
      <span className="scanner-chip__dot" />
      <span>{name}</span>
    </span>
  );
}
