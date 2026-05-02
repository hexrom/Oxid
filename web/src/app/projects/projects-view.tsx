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
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1 className="screen__title">Projects</h1>
          <p className="screen__subtitle">
            Imported Rust projects · click in to scan and review findings
          </p>
        </div>
        <div className="screen__head-actions">
          <button
            type="button"
            onClick={() => void load()}
            className="btn btn--ghost btn--icon"
            aria-label="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn btn--primary"
          >
            <Plus size={14} /> Import
          </button>
        </div>
      </header>

      {error ? (
        <div
          className="mono small"
          style={{
            color: "var(--err)",
            border: "1px solid color-mix(in oklab, var(--err) 30%, transparent)",
            background: "color-mix(in oklab, var(--err) 8%, var(--bg-1))",
            padding: "10px 12px",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      ) : null}

      {projects === null ? (
        <ProjectListSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState onImport={() => setImportOpen(true)} />
      ) : (
        <div className="proj-grid">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onRefresh={load} />
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
    <div className="proj-grid">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card"
          style={{ height: 180, opacity: 0.5 }}
          aria-hidden
        />
      ))}
    </div>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: "center",
        padding: "60px 24px",
        textAlign: "center",
      }}
    >
      <p className="mono" style={{ margin: 0, color: "var(--text)" }}>
        No projects imported yet.
      </p>
      <p className="small" style={{ margin: 0, color: "var(--text-3)" }}>
        Click Import to browse your GitLab repos.
      </p>
      <button type="button" onClick={onImport} className="btn btn--primary">
        <Plus size={14} /> Import a project
      </button>
    </div>
  );
}
