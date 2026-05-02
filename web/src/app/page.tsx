import { redirect } from "next/navigation";

import { Logo } from "@/components/logo";
import { getActiveConnection } from "@/lib/auth";
import { isGitlabConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: { auth_error?: string };
}) {
  const conn = await getActiveConnection();
  if (conn) redirect("/projects");

  const configured = isGitlabConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col gap-8 animate-fadeIn">
        <div className="flex flex-col gap-3">
          <Logo className="text-2xl" />
          <p className="text-base leading-relaxed text-textDim">
            Rust security scanning. Connect your GitLab to discover, import,
            and scan your projects.
          </p>
        </div>

        {searchParams.auth_error ? (
          <div className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs text-red-300">
            {searchParams.auth_error}
          </div>
        ) : null}

        {!configured ? (
          <SetupHint />
        ) : (
          <a href="/api/auth/gitlab" className="btn-primary w-full justify-center">
            Connect GitLab
          </a>
        )}

        <Footer />
      </div>
    </main>
  );
}

function SetupHint() {
  return (
    <div className="card flex flex-col gap-3 px-5 py-4">
      <h2 className="font-mono text-xs uppercase tracking-wider text-muted">
        Setup required
      </h2>
      <p className="text-sm text-textDim">
        GitLab OAuth is not configured. Create a GitLab application
        (Settings → Applications) with redirect URI{" "}
        <code className="rounded bg-surfaceAlt px-1 py-0.5 font-mono text-xs text-text">
          {`{APP_URL}`}/api/auth/gitlab/callback
        </code>{" "}
        and scopes <code className="font-mono text-xs text-text">read_user read_api read_repository</code>.
        Then set <code className="font-mono text-xs text-text">GITLAB_APP_ID</code> and{" "}
        <code className="font-mono text-xs text-text">GITLAB_APP_SECRET</code> in{" "}
        <code className="font-mono text-xs text-text">.env.local</code>.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <div className="flex items-center justify-between text-xs text-muted">
      <span className="font-mono">v0.1.0</span>
      <a
        href="https://github.com/hexrom/oxid"
        target="_blank"
        rel="noreferrer noopener"
        className="font-mono hover:text-textDim"
      >
        oxid CLI →
      </a>
    </div>
  );
}
