# Project map

**GENERATED — do not edit.** Run `npm run map` after moving or adding files;
`npm run check:structure` fails while this file is stale.

Read this before exploring: it answers "where does X live?" without a grep.
Rules live in [CLAUDE.md](CLAUDE.md). 480 source files across
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
- `assistant/` _(5)_
- `auth/` _(6)_
- `comments/` _(2)_
- `common/` _(2)_
- `diary/` _(8)_
- `drafts/` _(2)_
- `favorites/` _(1)_
- `feedback/` _(4)_
- `imports/` _(4)_
- `likes/` _(2)_
- `moderation/` _(1)_
- `recipes/` — editing, photos, publishing, query _(30)_
- `users/` _(6)_

## `src/application/` — use cases, DTOs, mappers, ports

- `ai/` — dtos, ports, use-cases _(16)_
- `assistant/` — dtos, ports, use-cases _(12)_
- `auth/` — dtos, mappers, ports, use-cases _(20)_
- `comments/` — dtos, mappers, ports, use-cases _(8)_
- `devices/` — ports, use-cases _(3)_
- `diary/` — dtos, mappers, use-cases _(18)_
- `drafts/` — dtos, mappers, use-cases _(8)_
- `favorites/` — use-cases _(3)_
- `feedback/` — dtos, mappers, use-cases _(3)_
- `i18n/` _(1)_
- `imports/` — dtos, mappers, use-cases _(10)_
- `likes/` — use-cases _(5)_
- `moderation/` — ports _(3)_
- `notifications/` — ports, use-cases _(7)_
- `ports/` _(1)_
- `recipes/` — dtos, editing, mappers, photos, ports, publishing, taxonomy, use-cases _(36)_
- `users/` — dtos, mappers, ports, use-cases _(17)_

## `src/infrastructure/` — repository impls, adapters, mappers, IO

- `admin/` — components _(11)_
- `ai/` — anthropic, disabled, gemini, groq, import, keys, photo-focus _(57)_
- `assistant/` _(9)_
- `config/` _(2)_
- `crypto/` _(1)_
- `email/` _(2)_
- `firebase/` _(3)_
- `i18n/` — locales _(1)_
- `imports/` — web, youtube _(14)_
- `logger/` _(1)_
- `moderation/` — data _(10)_
- `prisma/` — mappers _(9)_
- `repositories/` — ai, assistant, auth, comments, devices, diary, drafts, favorites, fcm, feedback, imports, likes, notifications, recipes, users _(23)_
- `security/` _(4)_
- `storage/` _(3)_

## `src/presentation/` — Express wiring

- `controllers/` — thin adapters — parse the validated request, call one use case, map the result _(16)_
- `http/` — failureToHttp: Failure.code → HTTP status + body _(6)_
- `middlewares/` — auth, AES envelope (de/encrypt), async error boundary, rate limiting _(12)_
- `routes/` — Express Router per feature; wires validator → controller _(15)_
- `server/` — composition root — bootstrap.ts (DI), app.ts (Express app), index.ts (entry) _(5)_
- `types/` — ambient .d.ts — the Express `Request` augmentation auth middleware fills in _(0)_
- `validators/` — Zod request schemas, one file per feature _(12)_

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

<!-- fingerprint: d3ccc5673f67e613 -->
