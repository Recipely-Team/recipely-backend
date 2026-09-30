# Architecture

[CLAUDE.md](CLAUDE.md) is the rule list — what you must do. This file is the reasoning
behind it: why the boundaries sit where they do, and what breaks when one is crossed.
When the two disagree, CLAUDE.md wins and this file needs an edit.

`scripts/check-structure.mjs` mechanises whatever can be mechanised here. A standard
written down but not enforced is a standard that holds until the first busy afternoon.

---

## The dependency rule

```
core ← domain ← application ← infrastructure
                    ↑              ↑
                    └─ presentation ┘
```

Arrows point at what a layer may import. Nothing points back up. The concrete payoff is
that `domain/` and `application/` compile and test with no Express, no Prisma and no
network: the 1400-odd unit tests run in about four seconds because almost none of them
need a container.

Two rules exist only to keep that true, and both are enforced:

- **`infrastructure/` may not import `express`.** Express is a delivery mechanism. A
  repository that knows about `Request` cannot be reused by the worker, which has no HTTP
  at all.
- **A controller may not import `PrismaClient`.** The moment one does, a use case has
  been skipped, and with it every ownership check and every `Result` the use case would
  have returned.

`worker/` is a second composition root, not a sixth layer. It wires the same use cases to
a queue instead of to routes, which is the test of whether the wiring was ever really
separable.

## Errors are values, not control flow

`domain/` and `application/` do not throw — enforced. They return `Result<T, Failure>`
from `@core/result/result`, and the type is what forces the caller to deal with the
failure case; an exception is invisible in a signature and reaches whatever handler
happens to be above.

The edge is `failureToHttp`, which maps `failure.code` to a status. A `Failure` subclass
whose code has no case there would surface as a 500, so `check:structure` asserts every
subclass is handled. `errorHandler` is the single place exceptions from outside our code
— Zod parse errors, driver errors — become `Failure`s, so there is exactly one
translation point rather than a `try/catch` per controller.

**A failure carries a `messageKey`, not a sentence.** The client picks its own copy from
that key, and the server renders it only for consumers that read `message` directly.
Because i18next answers an unknown key by echoing it, a key with no catalogue entry is
invisible at the call site and arrives as a dotted identifier on the user's screen —
which is what happened to 31 keys, the login failure among them. Rule L now compares the
two lists.

## Vocabularies

A word the system discriminates on — a moderation status, a job state, a role — is a
`const` object in `domain/`, and every other site references it, including the
discriminated union that consumes it:

```ts
export type ContentVerdict =
  | { readonly status: typeof ModerationStatus.Approved }
  | { readonly status: typeof ModerationStatus.Rejected; readonly hit: ModerationHit };
```

Writing `'approved'` in the union instead means the vocabulary has two definitions that
nothing keeps in step. And because these values are almost always *stored columns*, a
misspelling is not a type error where it is written — it is a row that no later `WHERE`
will ever match. The symptom is a count that reads zero and looks like a quiet week, not
a crash. Rule V enforces it; add a new vocabulary to its list when you define one.

## Ports

A capability the upper layers need and the lower layers provide is declared as an
interface *by the layer that needs it*, and implemented by the one that can — Evans
2003 p.55, infrastructure serving upper layers as services behind interfaces.

- A **repository interface** is declared in `domain/` beside the aggregate it loads.
- An **application port** (`PasswordHasherInterface`, `EmailSenderInterface`,
  `LoggerInterface`) is declared in `application/<feature>/ports/`, because the domain has
  no opinion about bcrypt or SMTP.

Both are named `*Interface` in a `*-interface.ts` file. The suffix is at the end and
spelled out: a leading `I` reads as noise at every use, and the old `i-` prefix sorted
each port away from the implementation it describes, so the two never appeared near each
other in a listing. The app repo uses the same convention — a port is a contract that
spans the wire, and it should be spelled the same on both sides of it.

## Aggregates

An aggregate is a consistency boundary: it is loaded, changed and saved as a unit, and
**references between aggregates are by id, never by object reference** (Evans 2003
p.89–93). A PR that adds an entity updates this table.

| Aggregate root | Members | Referenced by id from |
|---|---|---|
| `User` | `CreatorTag` (value object on the `users` row: the claimed social handle and its review) | `Recipe.ownerId`, `RecipeDraft.ownerId`, `ImportJob.ownerId`, `Comment.authorId`, `Feedback.userId`, `AIGenerationLog.userId` |
| `Recipe` | `RecipeMedia` (own table), `RecipeNutrition` + `IngredientGroup` (JSON columns), `ImageCredit` (value object on the `recipes` row: a curated cover's author, licence and source) | `Comment.recipeId`, `Favorite.recipeId`, `RecipeLike.recipeId` |
| `Comment` | — | likes, notifications (by id) |
| `RecipeDraft` | — | `ImportJob.draftId` — the draft an import produced |
| `ImportJob` | — | — |
| `Feedback` | — | — |
| `AIGenerationLog` | — | — |

Likes, favorites and follows are join rows, not aggregates: they have no identity of
their own and no behaviour beyond existing, so they live as repository operations rather
than entities.

## Entities and value objects

Entities extend `Entity<Props>` from `@core/entity`: identity is the `id`, and `equals`
compares that rather than field-by-field. Construction is a `private constructor` plus a
static `create(props): Result<T, ValidationFailure>` — an entity that exists is an entity
whose invariants held, and a constructor that could throw would put a half-built object
in reach.

A primitive that forms a conceptual whole and carries rules is promoted to a value object
(`Email`, `InstagramUrl`, `CuisineKey`) rather than being re-validated at each of the two
or three places that accept it. Value objects keep their bare names — no `ValueObject`
suffix, because the name of the concept is the useful part.

Behaviour lives with the data it belongs to. A derivation that reads three fields of
`Recipe` is a method on `Recipe`, not a helper in a use case: the use case orchestrates,
the entity decides.

## Persistence

Prisma stays behind the repository interfaces. Row mappers (`*.row-mapper.ts`) turn a row
into a domain entity and return `Result` — a corrupt column is a value the mapper reports,
not a throw from inside a query.

Two things that are easy to undo by accident:

- **A paged list and its count run in one `$transaction`.** Two round-trips to a 1 GB
  Oracle box for one screen is a cost worth not paying twice.
- **Every read of `users` filters `deletedAt: null`.** Deletion is a tombstone, so a
  missing filter does not fail — it resurrects an account the user asked to be rid of.
  `getAccountStatus` is the deliberate exception: it exists to report that very field.

## Where a new thing goes

| Adding… | Goes in |
|---|---|
| A rule about what a recipe *is* | `domain/recipes/recipe.ts` |
| An action a client can take | `application/<feature>/use-cases/` |
| A shape the client receives | `application/<feature>/dtos/` + a mapper |
| A capability the app needs from outside | port in `domain/` or `application/<feature>/ports/`, impl in `infrastructure/` |
| A word the system branches on | a `const` object in `domain/`, then register it in rule V |
| A user-visible error | a `Failure` subclass + a case in `failureToHttp` + a key in every catalogue |
| An HTTP route | validator → controller → route, wired in `bootstrap.ts` and `app.ts` |
