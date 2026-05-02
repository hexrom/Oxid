import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { ScannerChip } from "@/components/charts";
import { GitlabIcon } from "@/components/icons";
import { getActiveConnection } from "@/lib/auth";
import { isGitlabConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const SCAN_PREVIEW = `$ oxid scan --format json
[oxid] cloning gitlab.com/platform/axum-gateway @ 4f9c1ad2
[oxid] sbom         ✓  247 components
[oxid] advisories   !  6 matched
[oxid] lints        !  3 found
[oxid] policy       !  2 violations
[oxid] unsafe       !  1 hotspot
[oxid] scan complete · 13 findings · 47.2s`;

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: { auth_error?: string };
}) {
  const conn = await getActiveConnection();
  if (conn) redirect("/dashboard");

  const configured = isGitlabConfigured();

  return (
    <div className="connect-wrap">
      <div className="connect">
        <div className="connect__inner animate-fadeIn">
          <Logo size="lg" />
          <h1 className="connect__title">
            Security scanning for Rust, end to end.
          </h1>
          <p className="connect__copy">
            One dashboard for advisories, lints, policy and supply-chain checks
            across every repo. Connect your GitLab, import, and scan on demand.
          </p>

          {searchParams.auth_error ? (
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
              {searchParams.auth_error}
            </div>
          ) : null}

          {configured ? (
            <a href="/api/auth/gitlab" className="btn btn--primary btn--lg">
              <GitlabIcon size={16} /> Connect GitLab
            </a>
          ) : (
            <SetupHint />
          )}

          <div className="connect__scanners">
            {["advisories", "lints", "policy", "unsafe", "sbom"].map((s) => (
              <ScannerChip key={s} name={s} />
            ))}
          </div>

          <div className="connect__foot">
            <span className="mono small">v0.1.0</span>
            <a
              className="mono small link"
              href="https://github.com/hexrom/oxid"
              target="_blank"
              rel="noreferrer noopener"
            >
              oxid CLI →
            </a>
          </div>
        </div>
        <div className="connect__deco" aria-hidden="true">
          <pre className="connect__pre">{SCAN_PREVIEW}</pre>
        </div>
      </div>
    </div>
  );
}

function SetupHint() {
  return (
    <div
      className="card"
      style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div className="mono small upper" style={{ color: "var(--text-3)" }}>
        Setup required
      </div>
      <p style={{ margin: 0, color: "var(--text-2)", fontSize: 13, lineHeight: 1.55 }}>
        GitLab OAuth is not configured. Create a GitLab application
        (Settings → Applications) with redirect URI{" "}
        <code className="mono" style={{ color: "var(--text)" }}>
          {"{APP_URL}"}/api/auth/gitlab/callback
        </code>{" "}
        and scopes{" "}
        <code className="mono" style={{ color: "var(--text)" }}>
          read_user read_api read_repository
        </code>
        . Then set <code className="mono">GITLAB_APP_ID</code> and{" "}
        <code className="mono">GITLAB_APP_SECRET</code> in{" "}
        <code className="mono">.env.local</code>.
      </p>
    </div>
  );
}
