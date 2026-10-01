# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Token budget (applies to every task)

Work with the fewest tokens that still gets the job done right — token cost is a standing constraint on this project, not an afterthought.

- Read only what you need: prefer `grep`/`glob` with narrow patterns over reading whole files, and use `offset`/`limit` on large files. Don't re-read a file you just edited.
- Keep tool output small: pipe long command output through `tail`/`head`/`grep`. Run the narrowest test path (`npx jest <path>`) while iterating; run the full `npm test` once at the end.
- Batch independent tool calls into a single message instead of serializing them.
- Delegate to subagents when the workflow calls for it, but give each one a complete brief so it doesn't have to re-explore ground already covered — and don't spawn one for work that's cheaper to do inline.
- Keep replies short and factual. Skip restating the plan, recapping what the user already knows, and ceremonial summaries.

## Agent workflow (use by default)

For any non-trivial task in this repo, use the subagent team in `.claude/agents/` **without being asked**. Each agent file has YAML frontmatter and is auto-discovered.

- **Feature work** → `researcher → developer → test → reviewer`
- **Bug fix** → `researcher → debugger → reviewer` (debugger writes its own regression test)

Delegate with the matching `subagent_type` (`researcher`, `developer`, `test`, `reviewer`, `debugger`) via the Agent tool. Skip the workflow only for genuinely trivial one-liners (single-line edits, typos, formatting, version bumps). When in doubt, start with the researcher.

### End-to-end git flow (run the whole thing without asking)

The user has authorized the full flow below in this file. **Do not ask before push, PR, merge, or cherry-pick** on this repo — just execute and report. The only stops are explicit failures (CI red, reviewer `REQUEST_CHANGES`, merge conflict you can't safely resolve).

1. **Branch from `dev`**: `git checkout dev && git pull && git checkout -b <feat|fix|refactor|chore>/<name>`. Never edit on `dev` or `main` directly.
2. **Implement** using the agent workflow. Conventional-commit messages (`feat(scope):`, `fix(scope):`, …).
3. **Push and open PR** → `dev`: `git push -u origin <branch>` then `gh pr create --base dev …`.
4. **Wait for CI**: `gh pr checks <pr> --watch`. If `verify` fails, fix and re-push; do not merge red.
5. **Reviewer agent** must approve before merge. If `REQUEST_CHANGES`, loop back to developer/debugger; do not merge over a blocked review.
6. **Merge to `dev`**: `gh pr merge <pr> --squash --delete-branch`. Then locally: `git checkout dev && git pull --ff-only`.
7. **Promote `dev → main` via cherry-pick** (not merge — `dev` and `main` have diverged squash-merge histories; a direct merge produces add/add conflicts):
   ```
   git fetch origin
   git checkout -b <branch>-to-main origin/main
   git cherry-pick <dev-squash-sha>      # the SHA from step 6
   git push -u origin <branch>-to-main
   gh pr create --base main --title "<same as dev PR>" --body "Promotes #<dev-pr> to main"
   gh pr checks <pr> --watch
   gh pr merge <pr> --squash --delete-branch
   git checkout dev && git pull --ff-only
   ```
   `main` is branch-protected on the `verify` check and auto-merge is disabled — always watch checks then merge manually. See PRs #51, #53, #54 for the pattern.
8. **Report** the dev PR #, the main PR #, and the deployed commit. Stop.

### Exceptions (stop and ask)

- Database migrations that drop columns / tables or change types incompatibly (production data risk).
- Anything that would push `main` while CI is red, bypass branch protection, or skip the reviewer agent.
- Force-push, `git reset --hard` on shared branches, history rewrites.
- Memory-budget-relaxing changes to `docker-compose.yml` (the Oracle host is 1 GB RAM).

Full agent roster and rules: `.claude/agents/INDEX.md`. Regression classes and the guards that now catch them: [`docs/regressions.md`](docs/regressions.md).

## A bug fix ships the test that would have caught it (rule 24)

This is how the repo gets harder to break instead of merely getting patched. Three
steps, in order:

1. **Write the regression test.** It must fail against the unfixed code — a test that
   passes either way documents nothing. Name it after the SYMPTOM ("a user was told
   `errors.unauthorized.invalid_credentials` instead of Wrong email or password"), not
   the mechanism, and say in a comment what was wrong. The next reader is someone
   deciding whether they may change that line.
2. **Ask whether a gate could have caught it.** Prefer, in this order: a
   `check:structure` rule (mechanical, catches it in every future file), a coding
   standard here, a type that makes the state unrepresentable. Not everything qualifies;
   a race condition does not become a lint rule.
3. **Record the CLASS, not the incident**, in [`docs/regressions.md`](docs/regressions.md)
   — one line: symptom, root cause, what now prevents a recurrence. Git history already
   holds the incident; that file holds the lesson, and it stays short enough to read in
   one sitting.

Proportionality applies: a typo or a copy tweak needs none of this. A wrong behaviour a
user reported needs at least step 1. The goal is that the four gates find the next one
BEFORE a deploy does.

## Naming and vocabulary

- **Port interfaces are `*Interface`, in a `*-interface.ts` file** —
  `RecipeRepositoryInterface` in `recipe-repository-interface.ts`. The suffix goes at
  the END, spelled out: a leading `I` is Hungarian notation that reads as noise at the
  point of use, and `i-` sorted every port away from the thing it describes in a file
  listing. The app repo uses the same convention, so a contract that spans the wire is
  spelled the same on both sides. **Enforced** by `check:structure` rule O.
- **A word the app discriminates on is defined once** — a status, a role, a platform, a
  job state gets ONE const-object definition (`ModerationStatus`, `ImportJobStatus`,
  `AIGenerationStatus`) and every other site points at it, **including the discriminated
  union that consumes it**: `{ readonly status: typeof ModerationStatus.Approved }`.
  `status` is usually a stored column, so a misspelling is not a type error at the write
  site — it is a row that no later `WHERE` will match. **Enforced** by rule V; add a new
  vocabulary to its list when you define one.
- **Error message keys** live in `infrastructure/i18n/locales/errors/*.json` and must
  exist in every catalogue. i18next answers a miss by echoing the key, so a missing one
  reaches the user as a dotted identifier and nothing logs a problem. **Enforced** by
  rule L.

## Pre-commit quality gate

husky runs on every `git commit`:

- **lint-staged** → `eslint --fix` plus `jest --findRelatedTests` on staged `.ts` files.
- **tsc --noEmit** → full project type check.
- **check:structure** → `scripts/check-structure.mjs`.

`check:structure` findings block. `KNOWN_DEBT` holds the pre-existing violations and
**only shrinks** — an entry that no longer matches anything fails the gate as stale, and
adding one needs explicit approval in review. Emergency bypass is
`git commit --no-verify`; document the reason in the commit message.

## Commands

- `npm run dev` — run API locally with `tsx watch` (entry: `src/presentation/server/index.ts`).
- `npm run build` — emits `dist/` via `tsc -p tsconfig.build.json`, then `tsc-alias` (resolves `@*` path aliases at build time; runtime has no path-alias loader), then `scripts/copy-assets.mjs` (mirrors every non-TS file under `src/` into `dist/` at the same relative path — `tsc` only emits what it compiles, so the i18n catalogues would otherwise be missing and every error message would resolve to its raw key).
- `npm start` — run the built server (`dist/presentation/server/index.js`).
- `npm run lint` — ESLint 9 flat config (`eslint.config.mjs`) over `src/` and `tests/`.
- `npm run typecheck` — `tsc --noEmit`.
- `npm test` — Jest (`tests/unit`, ~1470 tests).
- CI (`.github/workflows/ci.yml`) runs **all three**: lint, typecheck, then the full Jest suite. Green means green; do not merge over a red `verify`.
- `npm run prisma:generate` — regenerate Prisma client after editing `prisma/schema.prisma`.
- `npm run prisma:migrate:dev` — author a new migration locally (interactive). `npm run prisma:migrate` runs `prisma migrate deploy` and is what the api container executes on boot.
- Local stack: `docker compose up -d` (postgres + api). Requires `.env` populated from `.env.example` (`JWT_SECRET` must be ≥32 chars).

## Architecture

Clean Architecture + DDD with strict inward dependencies. Layers map 1:1 to top-level dirs under `src/` and to TS path aliases:

```
core ← domain ← application ← infrastructure
                    ↑              ↑
                    └─ presentation ┘
```

- `@core/*` — framework-free primitives: `Result<T, F>`, `Failure` base class + concrete failures (`ValidationFailure`, `UnauthorizedFailure`, `NotFoundFailure`, `ConflictFailure`, `UnknownFailure`), `Entity<Props>`. Nothing here imports from other layers.
- `@domain/*` — entities (`Recipe`, `User`), value objects (`Email`), and **repository interfaces** (`RecipeRepositoryInterface`, `AuthRepositoryInterface`). Entities use private constructors + static `create(props): Result<T, ValidationFailure>` factories — never instantiate directly, never throw from constructors.
- `@application/*` — use cases (one class per action: `ListRecipesUseCase`, `RegisterUseCase`, …), DTOs, mappers (domain → DTO), and **ports** the application owns (`PasswordHasherInterface`, `TokenSignerInterface`). Use cases depend only on domain interfaces and application ports.
- `@infrastructure/*` — Prisma repository implementations, row-mappers (DB row → domain entity, also returning `Result`), security adapters (`BcryptPasswordHasher`, `JwtTokenSigner`), and `loadEnv()` (Zod-validated, parsed once at boot — do not read `process.env` elsewhere).
- `@presentation/*` — Express wiring: `server/bootstrap.ts` is the **composition root** (plain `new` calls, no DI container), `server/app.ts` builds the Express app, plus controllers, routes, Zod request validators, and middlewares.

Every top-level folder under `src/` is one of those layers (plus `worker/`, a second composition root) — `scripts/check-structure.mjs` blocks anything else. Non-code assets live inside the layer that owns them rather than in a folder of their own: the i18n catalogues sit at `infrastructure/i18n/locales/errors/*.json`, next to the only service that reads them, and are located with `__dirname` so resolution does not depend on the process's working directory. Ambient `.d.ts` files follow the same rule (`presentation/types/express.d.ts`, `infrastructure/admin/adminjs-modules.d.ts`).

### Result + Failure pattern (load-bearing)

Business logic does not throw. Use cases and repositories return `Result<T, Failure>` from `@core/result/result`. The HTTP edge translates failures via `failureToHttp` in `src/presentation/http/failure-to-http.ts`, which maps `failure.code` → status (`validation`→400, `unauthorized`→401, `not_found`→404, `conflict`→409, default 500). When you add a new failure type, add its `code` to that switch or it will surface as 500.

Controllers may still `throw` from Zod parsing — `errorHandler` (`src/presentation/middlewares/error-handler.ts`) is the single exit point that converts `ZodError` and unknown `Error` into `Failure` and routes them through `failureToHttp`. Async controller methods are wrapped with `asyncHandler` so rejected promises reach the error handler.

### Adding a feature, end-to-end

1. Domain: add/extend entity in `@domain/<feature>/`, declare repository interface.
2. Application: write use case in `@application/<feature>/use-cases/`, define DTO + mapper, declare any new ports.
3. Infrastructure: implement the repository in `@infrastructure/repositories/<feature>/` (return `Result`, never throw), add a row-mapper under `@infrastructure/prisma/mappers/` if the entity is persisted.
4. Presentation: Zod validator → controller → route. Wire all the above into `buildContainer()` in `src/presentation/server/bootstrap.ts` and mount the route in `createApp()` in `src/presentation/server/app.ts`.

### Auth

JWT bearer auth. `createAuthMiddleware(tokens)` (`src/presentation/middlewares/auth-middleware.ts`) verifies the token, then sets `req.user = { id, email }`. The `Request.user` augmentation lives in `src/presentation/types/express.d.ts` — keep that file's shape in sync if you extend the auth payload.

## TypeScript conventions enforced by tsconfig

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and **`exactOptionalPropertyTypes`**. The last one is the easy one to trip over: you cannot pass `{ search: undefined }` for an optional `search?: string` field. The codebase consistently uses conditional spreads for this — e.g. `...(parsed.search !== undefined ? { search: parsed.search } : {})`. Follow that pattern.

Path aliases (`@core/*`, `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*`) are rewritten to relative paths at build time by `tsc-alias`; the runtime has no alias resolver, so any new alias must also be added under `tsc-alias`'s scope (it reads from the same `tsconfig.build.json`).

## Persistence notes

- `prisma/schema.prisma` uses snake_case column names via `@map`, `citext` for `User.email` (case-insensitive uniqueness — there is a migration that enables the extension), and `@@index` on `Recipe(isPublished, categoryId, createdAt desc)` to match the list query shape in `PrismaRecipeRepository.list`. If you change the listing's `where`/`orderBy`, revisit that index.
- Repositories run paged list + count in a single `prisma.$transaction([...])` (one round-trip). Preserve that when adding new list endpoints.
- **One list envelope.** Every list endpoint answers `{ items, total, page, pageSize }` (`PageResult`, `domain/common/page-result.ts`) and parses its query with `PaginationQuerySchema` (`page` ≥ 1, `pageSize` default 20, max 100) — no `hasMore`, the client derives it from `total`. A response with several lists (the diary food search) holds one `PageResult` per list.
- Prisma client is a lazy singleton (`getPrismaClient()` in `src/infrastructure/prisma/prisma-client.ts`); shutdown calls `disconnectPrisma()` from the SIGTERM/SIGINT handler in `index.ts`.

## Deployment

Deploy is GitHub Actions → SSH to an Oracle Cloud box (1 GB RAM / 1 OCPU). The api container runs `npx prisma migrate deploy` on boot, so any new migration will apply automatically on the next push to `main`. Memory limits in `docker-compose.yml` (postgres 512 MiB, api 384 MiB with `NODE_OPTIONS=--max-old-space-size=320`) are tuned to that host — don't relax them without checking the host budget. The deploy job does `git reset --hard origin/main` on the server, so the server-side `.env` is the only state that must survive between deploys (the workflow guards against losing it).

CI on PRs and pushes to `dev` only runs `prisma generate` + `tsc --noEmit`. Deploy on `main` re-runs the same verify before SSHing.

### Direct server access (use without asking)

```
SSH_KEY=/Users/recep/Downloads/ssh-key-2026-04-20.key
SERVER=ubuntu@144.24.239.155
APP_DIR=~/recipely-backend
```

Connect or run remote commands directly — do not ask the user to do it:

```bash
# Connect
ssh -i /Users/recep/Downloads/ssh-key-2026-04-20.key -o StrictHostKeyChecking=no ubuntu@144.24.239.155

# Run a remote command
ssh -i /Users/recep/Downloads/ssh-key-2026-04-20.key -o StrictHostKeyChecking=no ubuntu@144.24.239.155 "<command>"
```

Common server operations:
- **Check logs**: `docker compose -f ~/recipely-backend/docker-compose.yml logs --tail=50 api`
- **Health check**: `curl -fsS http://127.0.0.1:3000/health`
- **Restart after env change**: `cd ~/recipely-backend && docker compose up -d --force-recreate api`
- **Edit .env**: `echo "KEY=value" >> ~/recipely-backend/.env` then recreate the container
- **New env vars** must be added to both `~/recipely-backend/.env` on the server AND the `environment:` block in `docker-compose.yml` (Docker Compose only injects vars explicitly listed there).

### Compose is the artifact, not `env.ts`

A variable listed in `docker-compose.yml`'s `environment:` block is **always**
passed to the container, so its `${VAR:-default}` overrides the Zod default in
`env.ts` rather than deferring to it. Changing a schema default alone changes
nothing in a deployed container — the diff reads correctly and the artifact
does not move. This cost a full deploy cycle on `COOKIE_SECURE`: the schema said
`true`, compose passed `false`, and the session cookie shipped without its
Secure flag anyway.

A variable **not** listed there never reaches the container at all, so setting
it in the server `.env` does nothing.

Verify a config change where it actually lands:

```bash
docker exec recipely-api sh -c 'echo $VAR_NAME'
```
