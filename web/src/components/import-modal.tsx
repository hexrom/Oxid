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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <div>
            <h2 className="modal__title">Import Rust project</h2>
            <p className="modal__sub">Browsing your GitLab repositories</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost btn--icon"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        <div className="modal__search">
          <Search size={14} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GitLab projects…"
            type="search"
          />
        </div>

        <div style={{ overflow: "auto" }}>
          {loading ? (
            <div
              className="mono small"
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
                padding: "48px 0",
                color: "var(--text-3)",
              }}
            >
              <Loader2 size={14} className="spin" /> Loading projects…
            </div>
          ) : error ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <p
                className="mono small"
                style={{ color: "var(--err)", margin: 0 }}
              >
                {error}
              </p>
              <button
                type="button"
                onClick={() => setDebouncedSearch((s) => s + "")}
                className="btn"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "48px 24px",
                textAlign: "center",
              }}
            >
              <p
                className="mono"
                style={{ color: "var(--text-2)", margin: 0 }}
              >
                No Rust projects found.
              </p>
              <p className="small" style={{ color: "var(--text-3)", margin: 0 }}>
                Try a different search, or check that you have GitLab projects
                with Rust as the primary language.
              </p>
            </div>
          ) : (
            <ul className="modal__list">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className={cn("modal__row")}
                  style={p.alreadyImported ? { opacity: 0.7 } : undefined}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mono modal__row-path trunc">
                      {p.name_with_namespace}
                    </div>
                    <div className="modal__row-meta">
                      <span className="mono">{p.default_branch ?? "main"}</span>
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
                    <span className="chip chip--ok">
                      <Check size={12} /> Imported
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => importProject(p)}
                      disabled={importing === p.id}
                      className="btn"
                    >
                      {importing === p.id ? (
                        <>
                          <Loader2 size={14} className="spin" /> Importing
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
