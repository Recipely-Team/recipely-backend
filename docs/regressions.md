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

## Timeouts that each looked right and added up to wrong

**Every provider had its own limit, so the chain had none.**
The typed assistant gave Gemini 60 seconds and Groq 60 more, and Groq's SDK retried
twice on top of that — so one turn could run past three minutes while the app gives up
at 90. And the phone's assistant, which gives up at 15, waited through all of it on a
Gemini "503 high demand" day (measured on dev: 32–39 s per answer), so every Siri
question fell back to opening the app. Each number had been reasoned about; nobody had
added them.
*Guard:* one deadline per turn, set by the use case from who is waiting
(`ASSISTANT_ANSWER_BUDGET_MS`: app 80 s, phone 12 s), shared by the chain between the
providers it has not tried, with SDK retries off. `assistant-timeout-budget.test.ts`
pins both budgets against the clients that wait for them, and `check:structure` rule
**R** refuses a `new Groq(` that does not state its `maxRetries` — the other clients
now say `2` out loud instead of inheriting it. **A limit on each step is not
a limit on the whole; set the whole, and let the steps divide it.**

## A language the request carried and the model never saw

**"Reply in their language", and nothing told the model which one.**
A voice session passes the language in `speechConfig`; the typed turn received
`languageCode` in its request and dropped it before either provider. So each model
guessed from one short message, against a system instruction full of Turkish examples —
and on dev the Groq fallback answered "How long should I boil an egg?" in Turkish for an
app set to `en`. It went unnoticed while Gemini answered first; the deadline change made
the fallback the one that answers Siri whenever Gemini is slow.
*Guard:* both typed seats build their instruction with `typedTurnInstruction(languageCode)`,
and a test per seat reads the outgoing request for the code. **A field that reaches the
use case is not a field the model gets; follow it to the wire.**

## A guard written against injection, applied to a cook

**"Kısık pirinç nedir" — "Üzgünüm, sadece tariflerle ilgili yardımcı olabilirim."**
The refine flow's last anti-injection rule told the model that if an instruction was
"not about creating or improving a cooking recipe", it should refuse politely. A
QUESTION is not an instruction to create or improve anything, so the model applied the
rule exactly as written — to a cook asking what an ingredient in their own recipe was,
about a word the same model had just written into it. Twice. Then it offered an
unrelated tip about maple syrup, because the schema made it fill `suggestion` regardless.
The client was never the problem: it already renders an unchanged answer as a plain
reply with no accept/decline card.
*Guard:* the refusal now names the SYSTEM rather than "anything that is not an
instruction", `RECIPE_CONVERSATION_RULES` says a question about the food is answered with
the recipe returned unchanged, and seven tests in `recipe-prompt.test.ts` fail without
it. **A rule that defines what it permits by what it is not will refuse something you
wanted; scope a guard to the thing it guards against.**

## A culinary term translated word by word

**A Turkish sütlaç recipe called for "kısık pirinç", which is not a thing.**
"Short-grain rice" rendered word for word: `kısa` became `kısık` ("turned-down", as in
heat), and the cook was left holding an ingredient no shop sells — which is why they
asked the question the rule above then refused to answer. Nothing validates an ingredient
NAME; the quality rules covered quantities, ratios, safety and technique, never whether
the words would mean anything to the person shopping.
*Guard:* a shared quality rule requires the name a cook uses in the response language
rather than a translation of the English term, carried by generate, import and refine
alike, with a test per flow. **A recipe is read by someone standing in a shop.**

## One half of a feature got the chain, the other half kept the default

**A recipe written by Gemini, answered by Groq, in dev and in production both.**
The generator grew an ordered provider chain (Gemini, then Groq) and the refiner beside
it stayed single-provider, chosen by `AI_PROVIDER` — which defaults to `groq`. So every
question and every edit typed under a generated recipe went to the weaker seat, in a
language it handles less well, for the whole life of the feature, with nothing
misconfigured and nothing to notice. The refiner also read the SINGULAR `GEMINI_API_KEY`,
which is empty on both boxes, so setting `AI_PROVIDER=gemini` would not have moved the
work to Gemini — it would have disabled /refine.
*Guard:* `createRecipeRefiner` builds from the key POOLS in Gemini-then-Groq order like
its twin, `FallbackRecipeRefiner` mirrors `FallbackRecipeGenerator`, and a test reads the
seats in order. **When one call site graduates off a default, grep for the others: the
one you leave behind keeps the old behaviour under a setting nobody will think to
question.**

## A rejected request the user could see and the operator could not

**Publishing a recipe answered 400 and the logs said nothing at all.**
The error handler logged only `status >= 500`, so a validation refusal left no trace —
not the field, not the reason — while the response carried the full diagnosis to the
client. Finding out which field had been refused meant reading the app's code and
reasoning about what it might have sent, for a failure the server had already named a
millisecond earlier.
*Guard:* every 4xx now logs `request_rejected` with the url, the method, the status and,
for a schema failure, each `path: code`. Paths and codes only — a test asserts the
refused VALUE never reaches the log, because the response already carries it to the
person who sent it and a log outlives the request by months. **A refusal nobody can read
is a bug report you have to reconstruct.**

## A route that rebuilds a body instead of adding to it

**A recipe published with photos left its draft in the drafts list.**
`/recipes/with-media` reshapes multipart fields into the JSON body the controller
validates — and it does that by ASSIGNING a new object, so every key not named in it is
dropped. `fromDraftId`, the field the server retires the draft by, was never named. The
app sent it, the recipe was created, nothing failed, and the draft simply stayed; the
sibling `/with-image` path carried it correctly all along, which is why it looked like it
worked.
*Guard:* a route test posts the multipart form and asserts on the body the controller
actually receives — snapshotted INSIDE the call, because the route restores the original
body the moment the controller returns, and an assertion made afterwards passes for the
wrong reason. **When a handler rebuilds a request, the fields it forgets fail silently.**

## The proxy was the narrower gate, so the app could never explain the refusal

**A profile photo over 1 MB failed, for a file the API allows five of.**
nginx defaults `client_max_body_size` to 1 MB and applies it to the WHOLE request, and
neither vhost ever set it. So every upload limit the product declares — 5 MB for an
avatar, 10 MB for a recipe photo, 50 MB for a video — was fiction: nginx answered its own
HTML 413 first, which the app cannot localize or even recognise as a size problem. The
app's own `media-upload.ts` had documented the 1 MB default while fixing the recipe path;
the avatar path was never brought along.
*Guard:* the vhost sets `client_max_body_size 55m`, just above the largest single file
Multer accepts, so the gate that refuses an upload is the one that answers in the user's
language and names the field. **A reverse proxy that is stricter than the app turns every
limit the app documents into a lie, and every refusal into an error nobody can act on.**

## The fix existed, on one box, in a file nothing tracked

**The same 1 MB refusal was diagnosed and fixed on dev a month before production hit it.**
The dev vhost carries a comment naming the cause exactly — "nginx defaults to 1 MB, so a
2.2 MB photo was rejected with 413 before ever reaching the app" — and sets
`client_max_body_size`. Production never got the line, because that file lived only on
that box: `deploy/nginx/` held the three production vhosts and nothing from dev, so there
was no diff anyone could read in which the difference would have shown.
*Guard:* both boxes' configs are in `deploy/nginx/` now, with a README table saying which
file is which host's and why both belong there. Also cleared on the way past: a `.bak-…`
copy sitting in `sites-enabled/`, which nginx loads like any other file — it had a
duplicate `server_name` that nginx was silently ignoring, so an edit to the wrong copy
would have done nothing at all.
**A fix that lives only on the machine it was applied to is a fix the next machine cannot
inherit.**

## A URL that did not move when its bytes did

**A replaced profile photo kept showing the old face until a hard reload.**
The avatar is stored as `<userId>.webp`, so a replacement produced a byte-for-byte
identical URL. The session updated, the component re-rendered with the same address, and
every cache from the image component to the browser answered with what it already had.
Nothing was broken on the way in — the new file was on disk the whole time.
*Guard:* the uploader returns `…/<userId>.webp?v=<timestamp>`; a test asserts two uploads
never return the same address, that the path stays put, and that only one file is ever on
disk. A query rather than a new filename, because a new name orphans the old file on a box
with no sweeper. **A URL is the identity of the bytes it names; when they change it has to
change with them.**


## A recipe that could not be made

**A sütlaç generated with no starch in it never set; a dessert arrived unsweetened; "make
it with honey" swapped a cupful of sugar for a spoonful and tasted of nothing.**
The quality rules covered quantities, ratios, safety and "traditionally correct technique"
— and a MISSING ingredient is not a technique, so nothing covered the one that makes the
dish set. Measured before the change: 4 generations of "sütlaç", one with no thickener at
all. Two rules now name the class (the ingredient that makes a dish set, thicken, rise,
bind or emulsify is the dish; a sweet dish carries a real weight of sweetener, and a
substitute is matched by weight — honey at about three quarters of sugar's) and the refine
flow is told a swap must do the job the ingredient was doing.

*What this does NOT do, stated plainly:* it moves the average and does not make it certain.
After the change the honey case still landed at 75 g, 110 g and 340 g across three runs,
one of them with the thickener missing again. **A prompt rule is a probability, not a
guarantee — an invariant a user can feel needs a check that does not depend on the model.**
The checkable half is narrow but real: a recipe in a dessert category with no sweetener in
its ingredient list is wrong without knowing anything about the dish, and that one can be
caught after generation rather than asked for before it.

## The first seat was dead and nothing said so

**Every recipe for days was written by the fallback provider.**
`GEMINI_MODEL_NAME` defaulted to `gemini-flash-latest`, which answers `503 high demand` to
every real request — so `FallbackRecipeGenerator` did its job, logged a warning nobody
reads, and Groq answered everything. The chain worked exactly as designed; what was
missing was anyone noticing that the preferred seat never once succeeded. Probed on the
deployed key: `gemini-3.8/3.7/3.6-flash` 503 the same way under a real prompt, every
pinned `2.x` id answers 404, and `gemini-flash-lite-latest` answered 3 of 3.
*The class:* **a fallback that is always taken is an outage with good manners.** A listed
model is not a callable one — probe before pinning, and treat "the second provider always
answers" as a fault rather than resilience.


## A record nobody could read

**A cook's conversation with the AI was stored from the start and shown on no screen.**
`recipe_drafts.chat_history` holds every turn — what was asked for, what the model
answered, which proposals were declined — and the admin panel printed the column as one
run-on blob of JSON. So the material for investigating "this recipe came out wrong" was
sitting in the database in a form nobody would read. The generation log had the same
shape of problem from the other side: `userPrompt` and `modelUsed` were recorded and left
out of the list, which is how "every recipe is being written by the fallback provider"
ran for days behind a list that looked fine.
*Guard:* the conversation renders as turns (marking the failed ones and the ones the cook
declined, because an assistant turn describing a change is not proof it happened), and
the generation list shows what was asked and which model answered.
*The class:* **storing it is not recording it.** A column that no screen renders is
evidence you will not have when you need it.

## A panel bound by strings

Admin components are wired by name in two places — `loader.add('X', './components/x')` and
`components: { show: 'X' }` — so a typo in either compiles, lints, passes every test, and
then shows a blank field or a broken page on a screen nobody opens until something has
already gone wrong.
*Guard:* `check:structure` rule AE checks both directions — a name bound to no
registration, and a registration pointing at a file that does not exist. Verified by
introducing each typo in turn and watching the gate name it.

## Provenance that was derivable twice and recorded neither time

**Nothing in the database said whether a person or a machine wrote a recipe, or where an
imported one came from.**
Both signals existed on paper and neither was written: `ai_generation_logs.generated_recipe_id`
is `null` at every call site, so a generation never linked to the recipe it produced, and
`sourceUrl` was never set by the publish path. Answering "was this written by a model?" for
a LIST would in any case have meant joining a log table per card, which a feed cannot do.
The information was also perishable in a way nobody had noticed: an Instagram import
produces a DRAFT, and by the time a cook publishes it a week later the finished text says
nothing about where it started.
*Guard:* `Recipe.origin` is a column with a default, set from the draft's own snapshot,
which records it at the one moment it is known. `sourceHandle` comes from the same probe
yt-dlp has always returned and nothing read. Six tests follow a provenance from the draft
to the persisted recipe, including the two ways it must fall back to "a person wrote it".
*The class:* **derivable is not recorded.** A fact you can reconstruct from two other
tables is a fact you will not have on a list screen, and one that a long-lived draft will
quietly lose.

### The SSRF allowlist had a second copy

*Symptom (latent, caught before it shipped):* the import host allowlist — the whole of the
SSRF guard in front of yt-dlp — was declared twice: in the `InstagramUrl` value object that
the enqueue path uses, and again inline in the synchronous import use case. Adding TikTok to
one would have left the other Instagram-only, so the same link would pass on one path and be
refused on the other.
*Guard:* the use case validates through `InstagramUrl.create`, and `check:structure` rule AF
refuses `ALLOWED_HOSTS` or a platform host literal anywhere outside `domain/imports/`.
*The class:* **a security allowlist copied is a security allowlist half-updated.** The value
object existed precisely so there would be one copy; the rule is what keeps it one.

### A key that belonged to a dataset started deciding who owns a reel

*Symptom (on dev, caught before release):* the second person to import and publish the same
Instagram reel would be told "recipe already exists".
*Why:* `recipes.source_url` carried a GLOBAL unique index from the food.com import, where it made
re-running the script an upsert. When publishing began copying an import's URL onto the
recipe (#332), the same index quietly handed each reel to whoever published it first.
*Guard:* the key is `@@unique([ownerId, sourceUrl])` — the scripts stay idempotent, two cooks
can share a source. `recipe-source-url-uniqueness.test.ts` asserts it on the schema.
*The class:* **a constraint added for one writer binds every later writer.** When a column
gains a new writer, re-read its constraints as if they were written for that writer.

### Secrets in the request log

*Symptom:* the API's request log carried the worker shared secret and the Cloudflare Access
client secret in plain text on every `/internal/import-jobs/claim` — every five seconds per
worker. Found while reading dev logs for an unrelated check.
*Why:* pino-http logs request headers in full, and the redact list named only
`authorization`. Each secret added to a header later was never added to the list.
*Guard:* `LOG_REDACT_PATHS` names every credential header; `log-redaction.test.ts` logs a
request carrying each one and asserts none survives.
*The class:* **a redact list is an allowlist in reverse — it only knows what it was told.**
Adding a credential header means adding it here in the same change. Values already written
to logs stay compromised until rotated.

### A client save replaced a record only the server writes

*Symptom:* the app autosaves a draft the moment it is opened. The draft schema accepted
neither provenance nor the fields an import fills in (cover, category, tags, tips,
nutrition), and the use case replaced the snapshot wholesale — so opening an import once
erased its origin, and a web import lost the fingerprint the copyright gate compares
against, which was a way round the gate.
*Guard:* `UpsertDraftUseCase` takes the server-owned fields (`SERVER_OWNED`) from the
stored draft and never from the body; the save schema carries the import-filled fields.
Tests in `upsert-draft-use-case.test.ts` and `recipe-edit-and-draft-schemas.test.ts`.
*The class:* **a wholesale replace from the client erases what only the server knows.**
When a stored JSON blob mixes client-editable and server-owned fields, the write path must
name which is which.

### A photo is one URL in two places

*Symptom:* removing a gallery photo that was also the cover left the removed photo on every
card; a recipe with no cover stayed blank after a photo was added; and the cover itself had
no DELETE, so an import's cover — the site's photo — could never be removed.
*Guard:* the cover follows the gallery through the entity (`withoutCover`,
`coverWithoutMedia`, `coverWithMedia`) and one repository write (`writeCover`) sets the cover
and drops the rows together. Regression tests in `remove-recipe-photo-use-case.test.ts`,
`add-recipe-photo-use-case.test.ts`, `remove-recipe-cover-use-case.test.ts`.
*The class:* **two fields that name the same thing drift unless one write moves both.**

### Empty nutrition counted as nutrition

*Symptom:* a recipe stored with `nutrition: {}` (or every macro 0 and 0 calories) showed
"nutrition unavailable" forever, and the sweep spent an AI call on it every run while only
ever adding a serving weight.
*Guard:* `Recipe.hasNutrition()` decides presence (a positive macro or positive calories);
the sweep asks it instead of `nutrition !== undefined`, and `listNeedingNutrition`'s SQL
mirrors the same rule. Tests in `backfill-recipe-nutrition-use-case.test.ts`,
`prisma-recipe-repository-needing-nutrition.test.ts` and `recipe.test.ts`.
*The class:* **"a value is present" and "a value means something" are different
questions.** Ask the entity, and make the selection query agree with it.

### An authenticated write with no bound

*Symptom:* `POST /me/devices` had no rate limit and no per-user cap, so one valid token
could insert device rows, each carrying an ip and a user agent, without end.
*Guard:* a per-user limiter (30/hour, `createDeviceRateLimitMiddleware`) and a 20-row cap
in `PrismaDeviceRepository.recordLogin` that evicts the oldest by `lastLoginAt`. Tests in
`me-routes-device-rate-limit.test.ts` and `prisma-device-repository.test.ts`.
*The class:* **a rate limit bounds the pace, not the total.** A route that inserts rows on
the caller's say-so needs both.

### A post's words read from one yt-dlp field

*Symptom:* a Facebook reel with its recipe name only in the post text
(`facebook.com/share/r/192Dg7W54U`, "Buruşuk sütlaç tarifi") failed every import with
"no recipe found": no speech, no on-screen text, and the probe handed the model no caption.
*Guard:* `readCaption` falls back to `title` for Facebook, where yt-dlp keeps the caption,
when `description` is empty. Tests in `reel-media-probe.test.ts` and `read-caption.test.ts`.
*The class:* **platforms disagree on which metadata field holds the same fact** — the
handle already had this (`readUploader`); every field read from yt-dlp needs the per-platform
question asked.

### A stored column that never reached the wire

*Symptom:* a published TikTok, YouTube or web import showed only the AI mark in the app;
the platform mark never appeared. `sourcePlatform` and `aiWritten` were stored (#334)
and read by the app's DTO, but `RecipeMapper` never emitted them.
*Guard:* both DTOs carry the two fields, and `recipe.mapper.test.ts` asserts them on the
detail and on the list row; the list row's exact-shape test now lists them too.
*The class:* **a field added to the row and to the client, but not to the mapper between
them, fails silently** — the client's fallback hides it. Assert the wire shape.

### A soft delete that still held a unique key

*Symptom:* import a recipe from a link, save it, delete it, import the same link again — saving
fails with "a recipe from this link already exists", forever, with nothing left to delete. Seen
live on dev with `yemek.com/tarif/trilece`.
*Guard:* the `(owner_id, source_url)` unique index is partial, `WHERE deleted_at IS NULL`
(migration `20260928120000_source_url_unique_live_only`); the scripts that upserted on the
compound key look up live rows instead. `recipe-source-url-unique-live-only.test.ts` reads the
migrations in order and asserts the index they leave.
*The class:* **a soft-deleted row still occupies every unique index it is in.** A unique
constraint on a soft-deletable table is partial on `deleted_at IS NULL`, or it outlives the row.

### A word filter that read across words

*Symptom:* an AI-written lentil soup could not be saved: "contains inappropriate language".
Its step said "add a splash of **hot water**". Ten of dev's 295 recipes could no longer be
saved or edited for the same reason ("throw that water away", "yaklaşık 150 g", "sıkışık").
*Why:* substring rules matched the whole text with every space removed, so "hot water" held
"twat" and "yaklaşık 150" (digits leet-folded) held "sikis"; and "sıkış-" folds onto "sikis".
*Guard:* a substring term matches inside one word, or across words only when it starts a word
(multi-word terms like "fare zehri"); letter-spaced evasion is still merged first. The sıkış-
forms are whitelisted. `word-list-content-moderator.test.ts` pins the real lines, and the
evasions that must still be caught.
*The class:* **a filter tuned on isolated words fails on sentences.** Test it on real recipe
text, not only on the terms.

### A provenance the client was not allowed to state

*Symptom:* a recipe made with "Generate recipe" published with no AI mark — dev had not one
`origin = AI` recipe in 120 days. The app shows "AI draft" in the editor; the saved recipe said
a person wrote it.
*Why:* the app mints a generated recipe's draft itself, and `origin`/`aiWritten` are
server-owned on drafts, so nothing ever told the server the text was a model's.
*Guard:* `provenanceOfDraft` asks the generation log (`GenerationHistoryInterface`) whether the
owner generated this draft's prompt; `recipe-provenance.test.ts` pins both answers.
*The class:* **a field only the server may write needs a server-side writer for every path
that produces it** — imports had one, generation did not.

## The push said it, the stored row did not

**Every import notification in the app showed the Instagram logo.** The FCM push named the
platform ("…from TikTok"), but the notification row stored only the recipe title, so the
in-app list had nothing to draw but its Instagram default.
*Guard:* the row now carries `sourcePlatform` / `sourceHandle` (done: from the worker;
failed and reaped: from the job's url via `ImportJob.sourcePlatform`), exposed on the list
DTO; pinned by `complete-import-job-use-case.test.ts`, `fail-import-job-use-case.test.ts` and
`prisma-notification-repository.test.ts`.
*The class:* **a fact the push text is built from belongs on the stored row too** — the feed
is the push's second reader, and it cannot re-derive what was only ever in the sentence.

## A path check that only read the path

**A curated dataset photo named `menemen.jpg` could be a link to the server's `.env`.**
The import resolved the photo's name against the dataset folder and checked the result
as a string — inside the folder, no `..`. A symlink or a hard link beside the JSON passes
that check, and the read then followed it and uploaded whatever it pointed at.
*Guard:* `readCuratedPhoto` opens with `O_NOFOLLOW` and `fstat`s the open handle (a regular
file with one link), so the check and the read are the same file; pinned by
`read-curated-photo.test.ts` (symlink in and out of the folder, hard link, traversals).
No mechanical gate fits: "this read is confined" is a property of how a file is opened,
not a shape `check:structure` can see in source.
*The class:* **a path check that compares strings does not confine a read: the filesystem
follows links the string cannot see.**

## A regex that saw one spelling of a letter

**"et" was found inside a decomposed "çet", and a decomposed "çilek" was not found at all.**
The ingredient-in-steps gate matched labels at a word start with a letter-only lookbehind.
A decomposed "ç" is "c" plus the combining mark U+0327; the mark is not a letter, so it
read as a word boundary, and composed and decomposed text never matched each other.
*Guard:* `mentionsIngredient` lowers, then NFC-normalises, and its lookbehind excludes
marks too (`[\p{L}\p{M}]`, since a mark NFC cannot compose, as in "x́", survives it);
pinned by `curated-gate-failures.test.ts` (decomposed "çet", "çilek" both ways, "x́et").
No mechanical gate fits: whether a regex runs over normalised text is a data-flow
property, not something a source pattern can tell.
*The class:* **a regex over user text must see one canonical form: normalise before
matching, or a decomposed letter becomes a boundary.**

## A model with no table

**The admin panel's Feature Flag tab failed on open, in dev and prod alike.** `FeatureFlag`
was added to `schema.prisma` with no migration. The client generated, tsc and every test
were green, and `feature_flags` simply did not exist — Prisma only notices a missing table
when a query hits it, and nothing but the admin panel ever queried this one.
*Guard:* `every-model-has-a-migration.test.ts` reads every `@@map` table in the schema and
fails unless some migration runs `CREATE TABLE` for it; the table itself is created by
`20261006100000_feature_flags`.
*The class:* **a schema model is a promise, not a table: every model needs the migration
that creates it, checked without a database.**

## An automation that outlived its owner's standing

**A suspended creator's comment-to-DM rules kept messaging their followers.** Delivery found
the connection and the matching rule and never asked whether the account behind them was
still allowed to act; suspension stopped the API session, not the worker.
*Guard:* `PrismaDmRuleRepository.findEnabledForMedia` returns no rule whose owner is
suspended or deleted; pinned by `prisma-instagram-repositories.test.ts` ("a suspended or
deleted creator's rules send nothing"). No mechanical gate fits: "this background path checks
the owner's standing" is a query property, not a source shape.
*The class:* **anything that acts on a user's behalf in the background must re-check that the
user may still act — a session check at the API edge does not reach the worker.**

## Text sent in our name, written by someone else

**A creator's DM text and public reply could carry any link, and no filter read them.**
Recipely sends both to strangers under its own name, so the automation was an open
phishing and spam channel.
*Guard:* `DmRule.create` refuses any link but the recipe's own `{link}` placeholder
(`carriesForeignLink`), and the create/update use cases run both texts through the content
filter (`moderateRuleText`); pinned by `dm-rule.test.ts` and `rules-use-cases.test.ts`.
*The class:* **user-written text that leaves under the product's name is product output:
it gets the product's link and content rules, not the author's.**

## Other people's data with no end date

**Followers' comment text and usernames were kept on every DM send record forever,**
while the webhook events they came from were pruned after a week.
*Guard:* the hourly prune also scrubs `commentText` / `commenterUsername` on sends older than
`DmRuleLimits.CommenterDetailRetentionDays` (30); pinned by `delivery-use-cases.test.ts`.
*The class:* **data about people who are not our users needs a retention limit at the moment
it is first stored.**

## Secrets in a backup file

**`.env.bak.<timestamp>`, a copy of a real `.env`, was committed with #376 and promoted to `main`,**
because `.gitignore` covered `.env` and `.env.*.local` but not a renamed copy.
*Guard:* `.gitignore` ignores every `.env.*` except `.env.example`; `check:structure` rule G
fails on any tracked env file; `scripts/guard-secrets.mjs` (pre-commit on staged files, and in
`check:structure` on every tracked file) refuses env files and copies, key/certificate files, and
text that looks like a private key or an API token. The values stay in git history.
*The class:* **an ignore rule that names the exact file misses its copies; ignore the family and
check what is tracked.**

## A user table the account deletion never names

**Deletion is a tombstone, so nothing cascades:** a new table holding a user's rows keeps them
after the account is deleted unless `deleteAccount` (or a `purgeUser` it calls) names it — and
nothing fails when it does not. Caught before it shipped, while adding the shopping list.
*Guard:* `every-user-table-is-handled-at-account-deletion.test.ts` reads the schema for every
model related to `User` and fails unless the deletion code deletes or scrubs it, or the model is
in that test's `RETAINED` list with its reason.
*The class:* **a tombstone does not cascade; every user-owned table must be named at deletion
or explicitly kept.**

## A recipe refused for two words that are clean apart

**A curated sarma recipe saying "sıkı sıra" (tight rows) was refused as profanity**: the cross-word
substring check glued "siki"+"sira" and found "sikis" starting the join, one letter into the second word.
*Guard:* a term may span words only if it reaches at least two letters into the last word
(`MIN_CROSS_WORD_REACH`); split evasions such as "sik is" still match. Pinned in
`word-list-content-moderator.test.ts`.
*The class:* **a filter that glues words must not let a single letter of the next word complete a match.**
