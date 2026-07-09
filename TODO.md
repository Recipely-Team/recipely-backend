# Recipely Backend — Bug Rectification Session

> All items resolved and shipped. Kept as a record of what was investigated and why.

## Summary

Of the 5 items in the original report, **3 were not reproducible** in this backend (real bugs,
just not here — most likely frontend-side) and **3 real backend bugs were found, fixed, reviewed,
and shipped to both `dev` and `main`** (one of the three real items was actually two: the auth-gating
fix and a pre-existing visibility gap it surfaced, bundled into one PR per user decision).

Initial investigation was based only on the text of the report (no screenshots were visible).
Partway through, the actual screenshots surfaced at `~/Desktop/Hatalar/` — real WhatsApp QA
feedback in Turkish — which corrected the picture: most of the screenshots were frontend/UI
complaints outside this repo's scope, but they also gave concrete, checkable evidence (an actual
shared-recipe-link screenshot, and a live dev-database query) that upgraded two findings from
"can't reproduce by reading code" to "confirmed root cause."

## Task 1: API Persistence Mappings and Transaction Atomicity

- [x] **Recipe creation/mutation sync drops — SHIPPED (PR #160 → #161).**
  Root cause: `CreateRecipeBodySchema`/`UpdateRecipeBodySchema` validated `cuisine`/`category`/
  `difficulty` against raw uppercase enum constants with no case normalization, while the
  list-query schema right next to it already normalized case for the same enums. A real QA
  screenshot showed a recipe form submitted with "Turkish"/"Soup"/"Medium" (title-cased); a live
  query against the dev database confirmed that exact recipe was never persisted. The request was
  being rejected by Zod before ever reaching the use case or database. Fixed by adding the same
  `.trim().toUpperCase()` transform to the create/update schemas, and fixed `error-handler.ts` to
  report all failing Zod fields instead of only the first.
- [x] **Profile bio field synchronization gap — NOT REPRODUCIBLE.**
  Checked twice, including after the real screenshot surfaced ("bio yazdığım şey profilde
  görünmüyor"). Both `/me` (settings) and the separate `GET /users/:id` (public profile) paths
  correctly read/write the same `bio` column end-to-end, no cache layer in between. Very likely a
  frontend stale-cache/no-refetch-after-edit issue — outside this repo.

## Task 2: Authentication Decoupling & Guest Route Architecture

- [x] **`GET /recipes/:id` made public for guests — SHIPPED (PR #164 → #165).**
  Confirmed via a real screenshot: a tester shared a recipe link and it redirected straight to
  login instead of a preview. Fixed by removing `authMiddleware` from `GET /:id` only (list and
  all write routes still require auth). Bundled in the same PR (user's explicit choice): closed a
  pre-existing, unrelated gap where `PrismaRecipeRepository.getById` had no `isPublished` filter at
  all, so any authenticated caller could already fetch someone else's unpublished/draft recipe by
  id — now guests and non-owners can only ever see published recipes. 7 use cases were updated to
  thread the requester's own id through so owners can still act on their own drafts.

## Task 3: Environment Synchronization & Performance

- [x] **Legal/static endpoint env mismatch — NOT REPRODUCIBLE.**
  `legal.routes.ts` is pure `res.sendFile()` on committed static HTML, zero env/config/DB
  involvement, no dev-api/localhost strings anywhere in the path. If the reporter really saw a
  dev-api URL, the app itself was pointed at the dev backend for that whole test session (confirmed
  separately — the shared recipe link was also on a `-dev` domain), which is expected dev-build
  behavior, not a backend bug.
- [x] **Category/cuisine filter "heavy payload" — SHIPPED (PR #162 → #163), different root cause
  than reported.** Pagination itself was already correct (capped at 100/page, single
  `$transaction`, proper filters) — not the problem. The real issue: the list endpoint reused the
  full single-recipe detail DTO for every row, shipping full `instructions`/`ingredients`/
  `nutrition`/`tips`/`media` ×100 rows/page. Fixed with a lean `RecipeListItemDto` used only by the
  list endpoint; detail view (`getById`) unchanged. First review round caught a real regression
  (dropped `likedByMe`, needed for list-view like-state UI) — fixed by adding `likedByMe` and
  `moderationStatus` back, then re-reviewed and approved.

## Shipped PRs

| Fix | Dev PR | Main PR |
|---|---|---|
| Recipe enum case-normalization | [#160](https://github.com/recepteksi/recipely-backend/pull/160) | [#161](https://github.com/recepteksi/recipely-backend/pull/161) |
| Lean recipe list DTO | [#162](https://github.com/recepteksi/recipely-backend/pull/162) | [#163](https://github.com/recepteksi/recipely-backend/pull/163) |
| Public GET /recipes/:id + unpublished-visibility fix | [#164](https://github.com/recepteksi/recipely-backend/pull/164) | [#165](https://github.com/recepteksi/recipely-backend/pull/165) |

## Not fixed here (outside backend scope, flagged for frontend/product)

- Profile bio not showing after edit — likely frontend cache/stale-fetch.
- Privacy Policy pointing at dev-api during testing — app was pointed at the dev backend for that
  session; not a backend config bug.
- Various UI/layout complaints from the same QA session (AI chat close friction, duplicate "My
  Recipes" buttons, filter icon number overlap, full-page reload on cuisine filter change, theme
  palette count, search screen layout, etc.) — all frontend/mobile-client issues, not in this repo.
