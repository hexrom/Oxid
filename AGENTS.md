# Oxid — project-wide rules for AI assistants

Oxid is one project with two halves:

- `cli/` — the Rust scan engine (`oxid scan`).
- `web/` — a Next.js dashboard that orchestrates scans and visualizes findings.

These rules apply to both. The web app has additional rules in [`web/.cursorrules`](./web/.cursorrules).

## Hard rules

1. **The CLI is the engine.** The web app must never reimplement scan logic in TypeScript. It clones a repo, runs `oxid scan --format json`, parses the output, stores it.
2. **One contract: the `Finding` JSON.** The shape lives in `cli/src/finding.rs` and is mirrored in `web/src/lib/types.ts`. Keep them in sync.
3. **Severity is lowercase, kind is kebab-case.** `critical | high | medium | low | info` for severity; `sca | sast | license | unsafe` for kind.
4. **The CLI scans the current working directory.** There is no `--path` flag. Always spawn with `cwd: <tempDir>`.
5. **Clone → scan → delete.** Temp dirs containing the OAuth-tokened `.git/config` must be removed in a `finally` block.
6. **Never log or return the OAuth token.** Strip it from any error tail before persisting.
7. **Single-user, self-hosted MVP.** No multi-tenancy, teams, billing, or GitHub support yet.

## Where to make changes

- Scan logic, severities, scanner integrations → `cli/`.
- Auth, UI, orchestration, storage → `web/`.
- Adding a new field to a finding → change `cli/src/finding.rs` first, then mirror to `web/src/lib/types.ts`, the Prisma `Finding` model, and the `toFindingRow` mapper in `web/src/lib/scanner.ts`.

## Design language (web)

- Dark, industrial, utilitarian. `#0a0a0a` background, `#141414` surface, `#1f1f1f` border.
- Single accent: oxide orange `#e85d26` — primary CTAs, the logo "o", critical-state accents only.
- Geist for chrome, JetBrains Mono for IDs / packages / versions / file paths.
- Minimal motion (150ms `fadeIn` only). 1px borders. Lucide icons at 16px.
