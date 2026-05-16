# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent workflow (use by default)

For any non-trivial task in this repo, use the subagent team in `.claude/agents/` **without being asked**. Each agent file has YAML frontmatter and is auto-discovered.

- **Feature work** → `researcher → developer → test → reviewer`
- **Bug fix** → `researcher → debugger → reviewer` (debugger writes its own regression test)

Delegate with the matching `subagent_type` (`researcher`, `developer`, `test`, `reviewer`, `debugger`) via the Agent tool. Skip the workflow only for genuinely trivial one-liners (single-line edits, typos, formatting, version bumps). When in doubt, start with the researcher.

### Branch flow (mandatory for every task)

1. **Start from `dev`**: `git checkout dev && git pull && git checkout -b <feat|fix|refactor>/<name>`. Never edit on `dev` or `main` directly.
2. Implement on the feature branch. Commit with conventional-commit style (`feat(...)`, `fix(...)`, etc.).
3. Open PR `<branch> → dev`. CI runs `prisma generate` + `tsc --noEmit`. Merge when green and reviewer-approved.
4. **Promote `dev → main` via cherry-pick, not merge**: `dev` and `main` have diverged squash-merge histories — a direct merge produces add/add conflicts. Branch off `origin/main`, cherry-pick the dev squash commit, open PR from that branch to `main`. Wait for the `verify` check (`gh pr checks --watch`), then `gh pr merge --squash`. See PRs #51, #53 for the pattern.

Full agent roster and rules: `.claude/agents/INDEX.md`.

## Commands

- `npm run dev` — run API locally with `tsx watch` (entry: `src/presentation/server/index.ts`).
- `npm run build` — emits `dist/` via `tsc -p tsconfig.build.json` then `tsc-alias` (resolves `@*` path aliases at build time; runtime has no path-alias loader).
- `npm start` — run the built server (`dist/presentation/server/index.js`).
- `npm run typecheck` — `tsc --noEmit`. This is what CI runs (`.github/workflows/ci.yml`); there is no `lint` step in CI even though `npm run lint` exists.
- `npm test` — Jest. **Tests directories (`tests/unit`, `tests/integration`) are currently empty and there is no `jest.config.*` checked in**, so this will need configuration before adding the first test.
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

- `@core/*` — framework-free primitives: `Result<T, F>`, `Failure` base class + concrete failures (`ValidationFailure`, `UnauthorizedFailure`, `NotFoundFailure`, `ConflictFailure`, `UnknownFailure`), `Entity<Props>`, `ValueObject`. Nothing here imports from other layers.
- `@domain/*` — entities (`Recipe`, `User`), value objects (`Email`), and **repository interfaces** (`IRecipeRepository`, `IAuthRepository`). Entities use private constructors + static `create(props): Result<T, ValidationFailure>` factories — never instantiate directly, never throw from constructors.
- `@application/*` — use cases (one class per action: `ListRecipesUseCase`, `RegisterUseCase`, …), DTOs, mappers (domain → DTO), and **ports** the application owns (`IPasswordHasher`, `ITokenSigner`). Use cases depend only on domain interfaces and application ports.
- `@infrastructure/*` — Prisma repository implementations, row-mappers (DB row → domain entity, also returning `Result`), security adapters (`BcryptPasswordHasher`, `JwtTokenSigner`), and `loadEnv()` (Zod-validated, parsed once at boot — do not read `process.env` elsewhere).
- `@presentation/*` — Express wiring: `server/bootstrap.ts` is the **composition root** (plain `new` calls, no DI container), `server/app.ts` builds the Express app, plus controllers, routes, Zod request validators, and middlewares.

### Result + Failure pattern (load-bearing)

Business logic does not throw. Use cases and repositories return `Result<T, Failure>` from `@core/result/result`. The HTTP edge translates failures via `failureToHttp` in `src/presentation/http/failure-to-http.ts`, which maps `failure.code` → status (`validation`→400, `unauthorized`→401, `not_found`→404, `conflict`→409, default 500). When you add a new failure type, add its `code` to that switch or it will surface as 500.

Controllers may still `throw` from Zod parsing — `errorHandler` (`src/presentation/middlewares/error-handler.ts`) is the single exit point that converts `ZodError` and unknown `Error` into `Failure` and routes them through `failureToHttp`. Async controller methods are wrapped with `asyncHandler` so rejected promises reach the error handler.

### Adding a feature, end-to-end

1. Domain: add/extend entity in `@domain/<feature>/`, declare repository interface.
2. Application: write use case in `@application/<feature>/use-cases/`, define DTO + mapper, declare any new ports.
3. Infrastructure: implement the repository in `@infrastructure/repositories/<feature>/` (return `Result`, never throw), add a row-mapper under `@infrastructure/prisma/mappers/` if the entity is persisted.
4. Presentation: Zod validator → controller → route. Wire all the above into `buildContainer()` in `src/presentation/server/bootstrap.ts` and mount the route in `createApp()` in `src/presentation/server/app.ts`.

### Auth

JWT bearer auth. `createAuthMiddleware(tokens)` (`src/presentation/middlewares/auth-middleware.ts`) verifies the token, then sets `req.user = { id, email }`. The `Request.user` augmentation lives in `src/types/express.d.ts` — keep that file's shape in sync if you extend the auth payload.

## TypeScript conventions enforced by tsconfig

`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and **`exactOptionalPropertyTypes`**. The last one is the easy one to trip over: you cannot pass `{ search: undefined }` for an optional `search?: string` field. The codebase consistently uses conditional spreads for this — e.g. `...(parsed.search !== undefined ? { search: parsed.search } : {})`. Follow that pattern.

Path aliases (`@core/*`, `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*`) are rewritten to relative paths at build time by `tsc-alias`; the runtime has no alias resolver, so any new alias must also be added under `tsc-alias`'s scope (it reads from the same `tsconfig.build.json`).

## Persistence notes

- `prisma/schema.prisma` uses snake_case column names via `@map`, `citext` for `User.email` (case-insensitive uniqueness — there is a migration that enables the extension), and `@@index` on `Recipe(isPublished, categoryId, createdAt desc)` to match the list query shape in `PrismaRecipeRepository.list`. If you change the listing's `where`/`orderBy`, revisit that index.
- Repositories run paged list + count in a single `prisma.$transaction([...])` (one round-trip). Preserve that when adding new list endpoints.
- Prisma client is a lazy singleton (`getPrismaClient()` in `src/infrastructure/prisma/prisma-client.ts`); shutdown calls `disconnectPrisma()` from the SIGTERM/SIGINT handler in `index.ts`.

## Deployment

Deploy is GitHub Actions → SSH to an Oracle Cloud box (1 GB RAM / 1 OCPU). The api container runs `npx prisma migrate deploy` on boot, so any new migration will apply automatically on the next push to `main`. Memory limits in `docker-compose.yml` (postgres 512 MiB, api 384 MiB with `NODE_OPTIONS=--max-old-space-size=320`) are tuned to that host — don't relax them without checking the host budget. The deploy job does `git reset --hard origin/main` on the server, so the server-side `.env` is the only state that must survive between deploys (the workflow guards against losing it).

CI on PRs and pushes to `dev` only runs `prisma generate` + `tsc --noEmit`. Deploy on `main` re-runs the same verify before SSHing.
