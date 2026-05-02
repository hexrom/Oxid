import { notFound, redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { ProjectDetailView } from "@/app/projects/[id]/project-detail-view";
import { getActiveConnection } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { name: true },
  });
  return {
    title: project ? `${project.name} · Oxid Web` : "Project · Oxid Web",
  };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { scan?: string };
}) {
  const conn = await getActiveConnection();
  if (!conn) redirect("/");

  const project = await prisma.project.findUnique({
    where: { id: params.id },
  });
  if (!project) notFound();

  return (
    <PageShell username={conn.gitlabUsername}>
      <ProjectDetailView
        projectId={project.id}
        initialScanId={searchParams.scan ?? null}
      />
    </PageShell>
  );
}
