# Oxid Web

A minimalist web dashboard for the [Oxid CLI](../cli) Rust security scanner. Connect your GitLab account, import your Rust projects, scan them on demand, and review findings in a clean, dark, terminal-flavored UI.

The CLI (`oxid scan --format json`) is the engine. This app clones a repo to a temp directory, shells out to the CLI, parses the JSON output, stores results in SQLite, and deletes the clone.

## Requirements

- Node.js 18.18+ (tested on 20 / 22 / 23)
- The [`oxid`](../cli) CLI built or installed (set `OXID_BIN` to the absolute path, or have it on `PATH`)
- `git` on `PATH`
- A GitLab application with redirect URI `{APP_URL}/api/auth/gitlab/callback` and scopes `read_user read_api read_repository`

## Setup

```bash
npm install
cp .env.example .env.local
# edit .env.local — set GITLAB_APP_ID and GITLAB_APP_SECRET at minimum
npx prisma db push
npm run dev
```

Open <http://localhost:3000> and click **Connect GitLab**.

## Environment

| Variable | Description |
|---|---|
| `GITLAB_APP_ID` | GitLab OAuth application ID. |
| `GITLAB_APP_SECRET` | GitLab OAuth application secret. |
| `GITLAB_INSTANCE_URL` | GitLab base URL. Defaults to `https://gitlab.com`. |
| `APP_URL` | Public base URL of this app. Defaults to `http://localhost:3000`. |
| `DATABASE_URL` | SQLite path. Defaults to `file:./dev.db`. |
| `OXID_BIN` | Path to the `oxid` binary. Defaults to `oxid`. |
| `SCAN_TIMEOUT_MS` | Scan timeout in ms. Defaults to `300000` (5 minutes). |

## How a scan works

1. User clicks **Scan now** on a project.
2. `POST /api/projects/[id]/scan` creates a `Scan` row, kicks off `executeScan(scanId)`, and returns the scan ID immediately.
3. The orchestrator clones the repo with `git clone --depth 1 --branch <default> --single-branch` into a temp dir, with the OAuth token injected as `oauth2:<token>@…`.
4. It runs `oxid scan --format json` with `cwd: <tempDir>`. Stdout is parsed as `Finding[]`.
5. Findings and a severity summary are written to SQLite. The temp dir is **always** removed in a `finally` block — leaking it would leak the OAuth token from `.git/config`.
6. The browser polls `GET /api/scans/[id]` every 3 seconds until status is `completed` or `failed`.

## Architecture

```
src/
├── app/
│   ├── api/                      # Route handlers (no separate backend)
│   │   ├── auth/gitlab           # OAuth start + callback + disconnect
│   │   ├── gitlab/projects       # List user's GitLab Rust repos
│   │   ├── projects/             # Import + list + detail + scan trigger
│   │   └── scans/[id]            # Scan status + findings
│   ├── page.tsx                  # / — Connect screen
│   └── projects/                 # /projects, /projects/[id]
├── components/                   # Severity badges, findings table, import modal, …
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   ├── gitlab.ts                 # GitLab API client + OAuth helpers
│   ├── scanner.ts                # Clone → scan → parse → store → cleanup
│   ├── auth.ts                   # Single-user connection helpers
│   ├── env.ts                    # Typed env access
│   └── types.ts                  # TS mirror of oxid's `Finding` struct
└── styles/globals.css
prisma/schema.prisma               # GitlabConnection · Project · Scan · Finding
```

## Security notes

- The OAuth token lives only in the SQLite row and in memory during clone operations. It is **never** included in API responses, UI strings, or logs.
- `redactToken()` strips the token from any error tail captured from `git`/`oxid` stderr before persisting it.
- The temp clone directory is removed in a `finally` even on timeout, on parse failure, on uncaught error.

## What this app does NOT do

- Reimplement scan logic. The CLI is the engine.
- Persist cloned repos.
- Manage users, teams, or billing.
- Support GitHub (yet).
- Use WebSockets — polling every 3 s is enough for an MVP.
