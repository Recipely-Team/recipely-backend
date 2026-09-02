# Project map

**GENERATED — do not edit.** Run `npm run map` after moving or adding files;
`npm run check:structure` fails while this file is stale.

Read this before exploring: it answers "where does X live?" without a grep.
Rules live in [CLAUDE.md](CLAUDE.md); the reasoning behind them in [architecture.md](architecture.md). 341 source files across
core, domain, application, infrastructure, presentation, worker.

## Layers

`core` → nothing · `domain` → core · `application` → domain, core ·
`infrastructure` → application, domain, core · `presentation` → all four.
Never upward, with no exceptions.
`worker/` is a second, separate composition root (own process entry, own
`@worker/*` alias) and may import `@infrastructure` and `@application`
directly, the same way `presentation/server/` does.

## `src/core/` — Result, Failure, Entity — building blocks only

- `entity/` _(1)_
- `failure/` _(11)_
- `result/` _(1)_

## `src/domain/` — entities, value objects, repository interfaces

One folder per feature; files sit flat (no subfolders) — an entity, its value
objects, and its `i-*-repository.ts` port live side by side.

- `ai/` _(3)_
- `assistant/` _(3)_
- `auth/` _(6)_
- `comments/` _(2)_
- `common/` _(2)_
- `drafts/` _(2)_
- `favorites/` _(1)_
- `feedback/` _(4)_
- `imports/` _(4)_
- `likes/` _(2)_
- `moderation/` _(1)_
- `recipes/` _(10)_
- `users/` _(1)_

## `src/application/` — use cases, DTOs, mappers, ports

- `ai/` — dtos, ports, use-cases _(14)_
- `assistant/` — dtos, ports, use-cases _(8)_
- `auth/` — dtos, mappers, ports, use-cases _(19)_
- `comments/` — dtos, mappers, ports, use-cases _(7)_
- `devices/` — ports, use-cases _(2)_
- `drafts/` — dtos, mappers, use-cases _(7)_
- `favorites/` — use-cases _(3)_
- `feedback/` — dtos, mappers, use-cases _(3)_
- `i18n/` _(1)_
- `imports/` — dtos, mappers, use-cases _(9)_
- `likes/` — use-cases _(5)_
- `moderation/` — ports _(2)_
- `notifications/` — ports, use-cases _(7)_
- `ports/` _(1)_
- `recipes/` — dtos, mappers, ports, taxonomy, use-cases _(21)_
- `users/` — dtos, ports, use-cases _(6)_

## `src/infrastructure/` — repository impls, adapters, mappers, IO

- `admin/` — components _(11)_
- `ai/` — anthropic, disabled, gemini, groq, import, keys _(43)_
- `assistant/` _(7)_
- `config/` _(2)_
- `crypto/` _(1)_
- `email/` _(2)_
- `firebase/` _(3)_
- `i18n/` — locales _(1)_
- `logger/` _(1)_
- `moderation/` — data _(9)_
- `prisma/` — mappers _(7)_
- `repositories/` — ai, assistant, auth, comments, devices, drafts, favorites, fcm, feedback, imports, likes, notifications, recipes, users _(19)_
- `security/` _(3)_
- `storage/` _(3)_

## `src/presentation/` — Express wiring

- `controllers/` — thin adapters — parse the validated request, call one use case, map the result _(14)_
- `http/` — failureToHttp: Failure.code → HTTP status + body _(3)_
- `middlewares/` — auth, AES envelope (de/encrypt), async error boundary, rate limiting _(10)_
- `routes/` — Express Router per feature; wires validator → controller _(13)_
- `server/` — composition root — bootstrap.ts (DI), app.ts (Express app), index.ts (entry) _(5)_
- `types/` — ambient .d.ts — the Express `Request` augmentation auth middleware fills in _(0)_
- `validators/` — Zod request schemas, one file per feature _(11)_

## `src/worker/` — the import pipeline's own process

Talks to the API over HTTPS only — no `DATABASE_URL`, no shared disk. Loads
its own env via `worker-config.ts` (never `@infrastructure/config/env`, which
is the API's schema and would demand vars a worker has no use for).

- `import-api-client.ts` · - `import-worker.ts` · - `main.ts` · - `worker-config.ts`

## Where to put a new thing

| Adding… | Goes in |
|---|---|
| A use case | `application/<feature>/use-cases/` |
| An entity or repository port | `domain/<feature>/` |
| A repository implementation | `infrastructure/repositories/<feature>/` |
| A Prisma row mapper | `infrastructure/prisma/mappers/` |
| A Zod request validator | `presentation/validators/<feature>.validators.ts` |
| A controller | `presentation/controllers/<feature>.controller.ts` |
| A route | `presentation/routes/<feature>.routes.ts`, mounted in `server/app.ts` |
| A migration | `prisma/schema.prisma` + `npm run prisma:migrate:dev` |
| An AdminJS resource | `infrastructure/admin/adminjs.ts` |
| A new Failure type | `core/failure/`, then a `case` in `presentation/http/failure-to-http.ts` |

## Commands

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` ·
`npm test` · `npm run check:structure` · `npm run map`

All four gates must be green before anything is done.

<!-- fingerprint: bbfbe15bb56d6a0a -->
