# Regressions — what broke, and what stops it next time

This file is the lesson, not the incident. Git history already records every bug and
its fix; what it does not record is the *class* of mistake, or which guard now catches
it. That is what belongs here, one row at a time.

Written per [CLAUDE.md rule 24](../CLAUDE.md). The discipline is:

1. a regression test that **fails against the unfixed code**,
2. a mechanical guard if one is possible — a `check:structure` rule beats a written
   standard, and a type that makes the state unrepresentable beats both,
3. a row here naming the class.

The point is that the four gates — `npm run lint`, `npm run typecheck`, `npm test`,
`npm run check:structure` — catch the next one of these before it reaches a deploy.
A bug that only production can find is a bug we pay for twice.

Keep this file short. If a row stops teaching anything, delete it.

---

## Strings that stand in for a vocabulary

**32 error messages reached the user as their own key.**
i18next answers an unknown key with the key itself, so a key that no catalogue defines
resolves *successfully* — to its own name. `failureToHttp` put that on the wire as
`message`, and the response was an ordinary 401 the whole way down: no throw, no log,
nothing failing. The user simply read `errors.unauthorized.invalid_credentials` where
"Wrong email or password" belonged, on the most-hit error path in the app.
*Guard:* `check:structure` rule **L** — every catalogue-shaped literal in `src/` must
exist in `en.json`, and every other locale must carry exactly `en.json`'s key set; plus
`failure-message-copy.test.ts`, which asserts `t(key) !== key`. **A lookup that reports
a miss by echoing its input cannot be checked at the call site** — something has to
compare the two lists. The rule first anchored on `new *Failure(` and was twice too
narrow: it missed the `messageKey:` object form, and it missed a key a ternary picks
before construction — which is where the 32nd one was still hiding.

**A status vocabulary was typed out in 31 files instead of pointed at.**
`ModerationStatus` existed as a const object and nothing used it: `'approved'`,
`'rejected'` and `'pending'` were spelled across all four layers, two files declared
their own parallel unions of the same three words, and one repository had resorted to a
local `const APPROVED = 'approved'`. `AIGenerationStatus` was a bare
`'success' | 'failed'` union — no name a call site could reach at all. The admin
dashboard counted import jobs with `where: { status: 'done' }`.
*Guard:* `check:structure` rule **V**. `status` is a stored column, so a misspelling is
not a type error at the write site — it is a row no later `WHERE` will ever match, and
the symptom is a screen that reports zero and looks like a quiet week. **The
discriminated union must consume the definition too**
(`{ readonly status: typeof ModerationStatus.Approved }`), or the vocabulary has two
sources of truth. Registering the first vocabulary in the rule immediately surfaced
four more sites.

**A bare namespace was used as a key.**
`new UnprocessableFailure('errors.validation', 'photo')` — uploading a recipe photo with
no file answered `message: "errors.validation"`. Covered by rule L above.

**A guard was written case-sensitively and missed the spelling it existed for.**
The first version of rule V anchored on a lowercase `status`, so
`moderationStatus: 'approved'` — roughly thirty of the sites it had just been written to
protect — never matched. It also could not see `decision: 'approved'` or the array form
`status: { in: ['queued', 'running'] }`, and that last one was still sitting in the admin
dashboard, two lines from the literals the same commit had fixed.
*Guard:* the rule matches `[a-z]*status`, `decision:` and `in: [` case-insensitively, and
a word claimed by two vocabularies now names both rather than suggesting the wrong one.
**A new gate rule is not evidence until you watch it fail** — the fix was verified by
probing it with the exact spelling it had been missing, not by reading the regex.

## Naming that hides what a thing is

**A port was findable only if you already knew its name.**
Port interfaces were `IRecipeRepository` in `i-recipe-repository.ts`. The leading `I` is
Hungarian notation that reads as noise at the point of use, and the `i-` prefix sorted
every port away from the thing it describes in a file listing — the interface and its
implementation never appeared near each other. The app repo had already moved off this.
*Guard:* `check:structure` rule **O**, now enforcing in both directions: an `I*` port is
rejected by name with its replacement suggested, and a `*Interface` is rejected outside
a `*-interface.ts` file. **The two repos spell the same concept the same way**, which is
the point — a port is a contract that spans them.

## Gates that did not gate

**Findings were printed and ignored, so the list grew.**
one-declaration-per-file and the file-size guard were report-only. A finding nobody has
to act on is a list that grows as easily as it shrinks, and it had reached 13.
*Guard:* they block now, with the existing 13 pinned in `KNOWN_DEBT.shape` — and the
debt list is checked against reality too: an entry that no longer matches anything fails
the gate as stale. **A debt list that is never re-read becomes a description of work
already done.** It only shrinks; adding to it needs approval in review.

**The gates ran only in CI.**
lint, typecheck and `check:structure` were CI-only, so a red tree could be committed
locally and only announced itself on push.
*Guard:* a husky `pre-commit` hook running the same three, with `lint-staged` scoping
eslint and the related tests to what is staged.
