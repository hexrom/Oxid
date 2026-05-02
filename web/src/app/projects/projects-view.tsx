"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ImportModal } from "@/components/import-modal";
import { ProjectCard, type ProjectCardData } from "@/components/project-card";

interface ProjectsResponse {
  projects: ProjectCardData[];
}

export function ProjectsView() {
  const [projects, setProjects] = useState<ProjectCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = (await res.json()) as ProjectsResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load projects");
      setProjects(data.projects ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold text-text">Projects</h1>
          <p className="mt-1 text-sm text-textDim">
            Imported Rust projects. Click into one to scan and review findings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="btn-ghost"
            aria-label="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn-secondary"
          >
            <Plus size={14} />
            Import
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs text-red-300">
          {error}
        </div>
      ) : null}

      {projects === null ? (
        <ProjectListSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void load()}
      />
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[88px] animate-pulse rounded-lg border border-border bg-surface"
        />
      ))}
    </div>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-sm text-text">No projects imported yet.</p>
        <p className="text-sm text-textDim">
          Click Import to browse your GitLab repos.
        </p>
      </div>
      <button type="button" onClick={onImport} className="btn-primary">
        <Plus size={14} />
        Import a project
      </button>
    </div>
  );
}
