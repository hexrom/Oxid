export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ScannerKind = "sca" | "sast" | "license" | "unsafe";

export const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export interface OxidLocation {
  file: string;
  line?: number | null;
  column?: number | null;
}

/** Mirrors the Rust `Finding` struct serialized by `oxid scan --format json`. */
export interface OxidFinding {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  kind: ScannerKind;
  package: string | null;
  version: string | null;
  location: OxidLocation | null;
  remediation: string | null;
  references: string[];
  source_scanners: string[];
}

export interface SeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
  scanners: string[];
}

export const EMPTY_SUMMARY: SeveritySummary = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
  total: 0,
  scanners: [],
};

export function summarizeFindings(findings: OxidFinding[]): SeveritySummary {
  const summary: SeveritySummary = { ...EMPTY_SUMMARY, scanners: [] };
  const scannerSet = new Set<string>();
  for (const f of findings) {
    summary[f.severity] = (summary[f.severity] ?? 0) + 1;
    summary.total += 1;
    for (const s of f.source_scanners) scannerSet.add(s);
  }
  summary.scanners = Array.from(scannerSet).sort();
  return summary;
}

export interface GitlabProjectSummary {
  id: number;
  name: string;
  name_with_namespace: string;
  path_with_namespace: string;
  default_branch: string | null;
  http_url_to_repo: string;
  web_url: string;
  description: string | null;
  last_activity_at: string;
  visibility: string;
  alreadyImported?: boolean;
}
