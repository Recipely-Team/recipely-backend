# Agent Team — Recipely Backend

Subagents for this project. Each `*.md` file (except this one) is a Claude Code subagent with YAML frontmatter — Claude Code auto-discovers them.

## Roster

| Agent | When to invoke |
|-------|----------------|
| **researcher** | First step for any non-trivial change. Read-only investigation + implementation plan. |
| **developer** | Implements a feature from the researcher's plan, inside-out across layers. |
| **test** | Writes Jest unit/integration tests after the developer is done. Sets up `jest.config.js` if missing. |
| **reviewer** | Final read-only audit before merge — architecture, Result/Failure, TS strict, security. |
| **debugger** | Bug fixes only. Reproduce → root cause → failing test → minimal fix. No drive-by refactors. |

## Workflows

**Feature**: `researcher → developer → test → reviewer`
**Bug**: `researcher → debugger → reviewer` (debugger writes its own regression test)

## Branch strategy

- `dev` (integration) → `main` (production)
- Feature branches off `dev`: `feat/<name>`, `fix/<name>`, `refactor/<name>`
- Never commit directly to `main` or `dev`
- All PRs require **reviewer** approval before merge

## Project ground rules (every agent must obey)

- Clean Architecture inward deps: `core ← domain ← application ← infrastructure / presentation`
- Business logic returns `Result<T, Failure>` — never throws
- Entities: private constructor + static `create(): Result<T, ValidationFailure>`
- New `Failure` codes must be mapped in `src/presentation/http/failure-to-http.ts`
- TS `exactOptionalPropertyTypes` is on — use conditional spread for optional fields
- `process.env` is read once in `loadEnv()`; nowhere else

Full conventions live in `CLAUDE.md` at the repo root.
