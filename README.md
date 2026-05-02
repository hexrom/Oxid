# Oxid

[![CI](https://github.com/hexrom/oxid/actions/workflows/ci.yml/badge.svg)](https://github.com/hexrom/oxid/actions/workflows/ci.yml)

Oxid is a Rust-native security scanner aggregator with two halves living side by side in this repo:

| Folder | What it is | Stack |
|---|---|---|
| [`cli/`](./cli) | The scan engine. Aggregates `cargo-audit`, `clippy`, `cargo-sbom`, `cargo-deny`, `cargo-geiger` and emits a unified report (human / JSON / SARIF). | Rust |
| [`web/`](./web) | A minimalist dashboard that connects to GitLab, imports Rust projects, runs `oxid scan` on demand, and visualizes findings. | Next.js 14, Prisma, SQLite |

The CLI is the engine. The web app shells out to it — never reimplements scan logic. See [`cli/README.md`](./cli/README.md) and [`web/README.md`](./web/README.md) for the per-half details.

## Quick start

### CLI

```bash
cd cli
cargo build --release
./target/release/oxid scan
```

Or install onto `PATH`:

```bash
cd cli
cargo install --path .
oxid scan --format json
```

### Web

The web app needs the CLI binary reachable. Either install with `cargo install --path cli` so `oxid` is on `PATH`, or set `OXID_BIN` to its absolute path in `web/.env.local`.

```bash
cd web
npm install
cp .env.example .env.local
# Set GITLAB_APP_ID, GITLAB_APP_SECRET, OXID_BIN
npx prisma db push
npm run dev
```

Open <http://localhost:3000>, click **Connect GitLab**, import a Rust repo, scan it.

## Repository layout

```
oxid/
├── cli/                    # Rust CLI (the scan engine)
│   ├── src/
│   ├── tests/
│   ├── Cargo.toml
│   └── README.md
├── web/                    # Next.js web dashboard
│   ├── src/
│   ├── prisma/
│   ├── package.json
│   └── README.md
├── README.md               # this file
├── AGENTS.md               # project-wide rules for AI assistants
└── .gitignore
```

## How the two halves talk to each other

The web app does **not** import the CLI as a library. It treats `oxid` as a black-box subprocess:

1. User clicks **Scan now** in the web UI.
2. The orchestrator at `web/src/lib/scanner.ts` clones the GitLab repo into a temp directory.
3. It spawns `oxid scan --format json` with `cwd: <tempDir>` (the CLI scans the current working directory; there is no `--path` flag).
4. Stdout is parsed as `Finding[]` — the same struct defined in `cli/src/finding.rs`. The TypeScript mirror lives at `web/src/lib/types.ts`.
5. Findings + a severity summary are written to SQLite. The temp dir is **always** removed in a `finally` block (it contains an OAuth-tokened `.git/config`).

The single contract between the two halves is the JSON shape of `Finding`. If you change the Rust struct in `cli/src/finding.rs`, mirror the change in `web/src/lib/types.ts`.

## License

See [`cli/`](./cli) for license details.
