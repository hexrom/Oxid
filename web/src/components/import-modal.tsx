"use client";

import { Check, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { GitlabProjectSummary } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [projects, setProjects] = useState<GitlabProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetch(`/api/gitlab/projects?${params.toString()}`);
        const data = (await res.json()) as {
          projects?: GitlabProjectSummary[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.projects) {
          throw new Error(data.error ?? "Failed to list GitLab projects");
        }
        setProjects(data.projects);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function importProject(p: GitlabProjectSummary) {
    if (p.alreadyImported) return;
    setImporting(p.id);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gitlabProjectId: p.id,
          name: p.name,
          nameWithNamespace: p.name_with_namespace,
          defaultBranch: p.default_branch ?? "main",
          httpUrlToRepo: p.http_url_to_repo,
          webUrl: p.web_url,
          language: "Rust",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setProjects((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, alreadyImported: true } : x)),
      );
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-12 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="font-mono text-sm font-semibold text-text">
              Import Rust project
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Browsing your GitLab repositories
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GitLab projects…"
              className="input pl-9 font-mono"
              type="search"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" />
              Loading projects…
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="font-mono text-sm text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => setDebouncedSearch((s) => s + "")}
                className="btn-secondary"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <p className="font-mono text-sm text-textDim">
                No Rust projects found.
              </p>
              <p className="text-xs text-muted">
                Try a different search term, or check that you have GitLab
                projects with Rust as the primary language.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-5 py-3",
                    p.alreadyImported && "opacity-70",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm text-text">
                      {p.name_with_namespace}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span className="font-mono">
                        {p.default_branch ?? "main"}
                      </span>
                      <span>·</span>
                      <span>updated {formatRelative(p.last_activity_at)}</span>
                      {p.visibility ? (
                        <>
                          <span>·</span>
                          <span>{p.visibility}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {p.alreadyImported ? (
                    <span className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-textDim">
                      <Check size={12} /> Imported
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => importProject(p)}
                      disabled={importing === p.id}
                      className="btn-secondary"
                    >
                      {importing === p.id ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Importing
                        </>
                      ) : (
                        "Import"
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
