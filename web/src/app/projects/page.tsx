import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { ProjectsView } from "@/app/projects/projects-view";
import { getActiveConnection } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Projects · Oxid Web",
};

export default async function ProjectsPage() {
  const conn = await getActiveConnection();
  if (!conn) redirect("/");

  return (
    <PageShell username={conn.gitlabUsername}>
      <ProjectsView />
    </PageShell>
  );
}
