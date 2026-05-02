import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { DashboardView } from "@/app/dashboard/dashboard-view";
import { getActiveConnection } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseSummary } from "@/lib/api";
import { SEVERITY_ORDER, type Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overview · Oxid Web",
};

export default async function DashboardPage() {
  const conn = await getActiveConnection();
  if (!conn) redirect("/");

  const projects = await prisma.project.findMany({
    orderBy: { importedAt: "desc" },
    include: {
      scans: {
        orderBy: { startedAt: "desc" },
        take: 14,
      },
    },
  });

  const totals = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };
  const projectsView = projects.map((p) => {
    const latest = p.scans[0] ?? null;
    const summary = latest ? parseSummary(latest.summary) : null;
    if (summary) {
      for (const s of SEVERITY_ORDER) totals[s] += summary[s];
      totals.total += summary.total;
    }
    const trend = p.scans
      .slice()
      .reverse()
      .map((s) => parseSummary(s.summary)?.total ?? 0);
    return {
      id: p.id,
      name: p.name,
      nameWithNamespace: p.nameWithNamespace,
      lastScan: latest?.completedAt ?? latest?.startedAt ?? null,
      summary,
      trend,
    };
  });

  // Build a heatmap: bucket the most recent 14 scans (across all projects) by date.
  const allScans = projects.flatMap((p) =>
    p.scans
      .filter((s) => s.summary)
      .map((s) => ({ date: s.completedAt ?? s.startedAt, summary: parseSummary(s.summary) })),
  );
  const buckets = new Map<string, Record<Severity, number>>();
  for (const s of allScans) {
    if (!s.date || !s.summary) continue;
    const key = new Date(s.date).toISOString().slice(0, 10);
    const cur =
      buckets.get(key) ??
      ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>);
    for (const sev of SEVERITY_ORDER) cur[sev] += s.summary[sev];
    buckets.set(key, cur);
  }
  const heatmap = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, sevs]) => ({
      date: new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
      }),
      ...sevs,
    }));

  // Activity feed: latest 8 scans across projects.
  const activity = projects
    .flatMap((p) =>
      p.scans.slice(0, 3).map((s) => ({
        project: p.name,
        kind:
          s.status === "completed"
            ? ("scan_completed" as const)
            : s.status === "failed"
              ? ("scan_failed" as const)
              : ("scan_running" as const),
        when: (s.completedAt ?? s.startedAt).toISOString(),
        summary: parseSummary(s.summary),
        durationMs: s.duration,
        errorMessage: s.errorMessage,
      })),
    )
    .sort((a, b) => b.when.localeCompare(a.when))
    .slice(0, 8);

  return (
    <PageShell username={conn.gitlabUsername}>
      <DashboardView
        totals={totals}
        projects={projectsView}
        heatmap={heatmap}
        activity={activity}
        projectCount={projects.length}
      />
    </PageShell>
  );
}
