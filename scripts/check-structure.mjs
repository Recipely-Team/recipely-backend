#!/usr/bin/env node
/**
 * Structural gate for the Recipely backend. Enforces:
 *   B. Layer dependency direction (Clean Architecture + DDD, see CLAUDE.md):
 *      core → nothing, domain → core, application → domain/core,
 *      infrastructure → domain/core/application, presentation → all four.
 *      `worker/` is a second composition root (own process entry, own
 *      @worker/* alias) and may import @infrastructure and @application
 *      directly, same as presentation/server/*.
 *   C. Alias-only imports (`@layer/...`); `./` allowed only in barrel index.ts,
 *      `../` never allowed — there is always an `@layer/...` for it.
 *   I. Folder file counts: warn past 10, block past 15. A folder is a unit of
 *      meaning, not a bucket — past ~15 nobody reads it any more, they grep it.
 *   J. PROJECT-MAP.md freshness — the map only saves anyone time while true.
 *   K. No unguarded console.* in src/ outside infrastructure/logger/, which
 *      owns the one pino instance every other module logs through.
 *   P. Every top-level folder under `src/` is one of the six layers. Anything
 *      beside them is code no rule here has ever inspected.
 *   O. Port interfaces are `*Interface`, in a `*-interface.ts` file
 *      (`RecipeRepositoryInterface`, `TokenSignerInterface`). The suffix goes
 *      at the END, spelled out: a leading `I` reads as noise at the point of
 *      use, and the old `i-` prefix sorted every port away from the thing it
 *      describes in a file listing. Enforced both ways — an `I*` port is
 *      rejected by name, and a `*Interface` outside a `*-interface.ts` file
 *      is too. The app repo uses the same convention.
 *   V. No vocabulary spelled out where a name exists — a word the system
 *      discriminates on (a moderation status, a job state) is a const object
 *      in domain/, and every site references it. These are stored columns, so
 *      a misspelling is not a type error where it is written: it is a row no
 *      later WHERE will match.
 *   L. Every message key a `Failure` carries exists in en.json, and every
 *      locale carries exactly en.json's key set. i18next answers an unknown
 *      key by echoing it, so a missing one reaches the user as a dotted
 *      identifier and nothing logs a problem.
 *   No `throw` in domain/ or application/ — business logic returns
 *      `Result<T, Failure>` (@core/result/result); throwing there defeats the
 *      one thing the Result type exists to make impossible: an uncaught
 *      failure path the HTTP edge never gets a chance to translate.
 *   Infrastructure must not import `express` — Express is a presentation
 *      concern; the one legitimate exception is the module that actually
 *      builds the AdminJS router Express mounts.
 *   Controllers must not import `PrismaClient` — a controller talks to a use
 *      case, never the ORM. The one exception is the liveness/readiness
 *      check, which has nothing to ask a use case and pings the DB directly.
 *   Every `Failure` subclass's `code` must have a matching `case` in
 *      failure-to-http.ts, or a new failure silently falls through to 500
 *      with no field/messageKey handling of its own.
 *   No `process.env` outside `loadEnv()` — config is parsed once, at boot;
 *      reading it ad hoc elsewhere means two call sites can disagree about
 *      what the environment says. `worker/worker-config.ts` is its own
 *      process with its own loader and is allowlisted by path.
 *
 * Blocking, but with a KNOWN_DEBT.shape allowlist of pre-existing files:
 *   A. One declaration per file. The class-exemption is widened to port-
 *      interface files (a `*-interface.ts` file's helper request/reply shapes
 *      don't count against its one `*Interface` port), and an allowlist of supporting-
 *      shape suffixes (Input, Result, Data, Credentials, Query, Verdict, Hit,
 *      Snapshot, Context) never counts as a second declaration either.
 *   F. File size. Entities and row-mappers shape data and read badly past
 *      ~150 lines; use cases orchestrate and get ~200; everything else 400.
 *      presentation/server/bootstrap.ts and infrastructure/admin/adminjs.ts
 *      are composition roots — they will never shrink, and that is correct,
 *      so they are exempted by path rather than left to rot in KNOWN_DEBT.
 *
 * KNOWN_DEBT entries are pre-existing violations tolerated until burned down.
 * Adding a NEW entry requires explicit user approval in review.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
// All paths below (files, KNOWN_DEBT keys, reported violations) are relative
// to SRC so the layer logic stays src-free.
const SRC = path.join(ROOT, 'src');
// LAYERS is now the whole of src/ — there is no top-level folder outside a
// layer left to exempt. What the walker still skips it skips by KIND, not by
// location: *.d.ts (ambient declarations, no imports to direct) and non-.ts
// files such as the i18n catalogues under infrastructure/i18n/locales/. Both
// now live inside the layer that owns them, so a new one cannot land in a
// no-man's-land the gate never looks at.
//   worker/   — walked, but as its OWN composition root (see ALLOWED_IMPORTS).
const LAYERS = ['core', 'domain', 'application', 'infrastructure', 'presentation', 'worker'];
const errors = [];
const reportOnly = [];

/** Pre-existing rule violations. Burn down; never grow. */
const KNOWN_DEBT = {
  /**
   * One-declaration-per-file and file-size findings that predate the rules
   * becoming blocking.
   *
   * A finding used to be printed and ignored, which meant the list could grow
   * as easily as it could shrink — and it grew. It is now a fixed set: anything
   * NOT listed here fails the gate, and a line that stops matching is reported
   * as stale so the list cannot outlive the debt it describes. Adding an entry
   * needs explicit approval in review; removing one needs only the fix.
   */
  shape: new Set([
    'application/auth/dtos/auth.dto.ts',
    'application/comments/dtos/comment.dto.ts',
    'application/drafts/dtos/draft.dto.ts',
    'application/recipes/dtos/recipe.dto.ts',
    'domain/imports/import-job.ts',
    'domain/recipes/recipe-media.ts',
    'domain/recipes/recipe-query.ts',
    'infrastructure/assistant/live-setup.ts',
    'infrastructure/moderation/data/types.ts',
    'infrastructure/repositories/auth/prisma-auth-repository.ts',
    'infrastructure/repositories/recipes/prisma-recipe-repository.ts',
    'presentation/controllers/recipes.controller.ts',
    'presentation/http/failure-to-http.ts',
  ]),

  // "no process.env outside loadEnv()" — reads that predate the rule.
  processEnv: new Set([
    'infrastructure/logger/pino-logger.ts',
    'infrastructure/prisma/prisma-client.ts',
    'presentation/server/cors-origins.ts',
  ]),
};

const ALLOWED_IMPORTS = {
  core: ['@core'],
  domain: ['@core', '@domain'],
  application: ['@core', '@domain', '@application'],
  infrastructure: ['@core', '@domain', '@application', '@infrastructure'],
  presentation: ['@core', '@domain', '@application', '@infrastructure', '@presentation'],
  // Second composition root: its own process entry (start:worker/dev:worker),
  // its own @worker/* alias in tsconfig + jest — treated like
  // presentation/server/*, which is the API's composition root.
  worker: ['@core', '@domain', '@application', '@infrastructure', '@worker'],
};
// Strips comments while preserving line numbers (block comments become blank
// lines of the same count) — several checks below (console.*, process.env)
// must not fire on a comment merely explaining the rule they enforce.
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(path.relative(SRC, p));
  }
};
for (const l of LAYERS) if (fs.existsSync(path.join(SRC, l))) walk(path.join(SRC, l));

/**
 * AdminJS owns this directory's layout, so two of our rules do not apply to it.
 *
 * `ComponentLoader.add()` takes a RELATIVE path and AdminJS bundles these files
 * for the browser with its own bundler — which reads neither `tsconfig`'s paths
 * nor `tsc-alias`. An `@infrastructure/...` import inside one of them would
 * type-check here and fail in the panel. The folder's file count is AdminJS's
 * too: one component per custom field is its convention, not ours.
 *
 * They are walked for everything else — rule V, rule K and the layer direction
 * all apply. Until `.tsx` was added to the walker these 16 files were invisible
 * to every rule in this gate.
 */
const ADMIN_COMPONENTS = 'infrastructure' + path.sep + 'admin' + path.sep + 'components';
const isAdminComponent = (f) => f.startsWith(ADMIN_COMPONENTS + path.sep);

const isTest = (f) => /__tests__|\.test\.ts$/.test(f);
const isBarrel = (f) => path.basename(f) === 'index.ts';

for (const file of files) {
  const src = fs.readFileSync(path.join(SRC, file), 'utf8');
  // Comment-stripped view for every content check below that must not fire on
  // prose explaining the rule ("never throws", "would put process.env behind
  // a security decision", ...) rather than the code itself.
  const clean = stripComments(src);
  const layer = file.split(path.sep)[0];

  // --- B + C: import rules -------------------------------------------------
  const importRe = /from\s+['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(importRe)) {
    const spec = m[1];
    if (spec.startsWith('../')) {
      if (!isAdminComponent(file)) errors.push(`${file}: relative parent import '${spec}' — use the @layer alias`);
    } else if (spec.startsWith('./') && !isBarrel(file)) {
      if (!isAdminComponent(file)) errors.push(`${file}: relative import '${spec}' — use the @layer alias`);
    }
    const target = LAYERS.map((l) => `@${l}`).find((a) => spec === a || spec.startsWith(a + '/'));
    if (!target) continue;
    const allowed = ALLOWED_IMPORTS[layer] ?? [];
    if (allowed.includes(target)) continue;
    errors.push(`${file}: layer violation — ${layer} may not import '${spec}'`);
  }

  if (isTest(file)) continue;

  // --- no throw in domain/ or application/ ----------------------------------
  // Business logic returns Result<T, Failure>; a thrown error bypasses every
  // failureToHttp mapping and surfaces as an unhandled 500 with no messageKey.
  if (layer === 'domain' || layer === 'application') {
    if (/\bthrow\b/.test(clean)) {
      errors.push(`${file}: 'throw' in ${layer}/ — return Result.fail(new ...Failure(...)) instead (CLAUDE.md)`);
    }
  }

  // --- infrastructure must not import express -------------------------------
  if (layer === 'infrastructure' && file !== 'infrastructure/admin/build-admin-router.ts') {
    if (/from\s+['"]express['"]/.test(clean)) {
      errors.push(`${file}: infrastructure imports 'express' — Express belongs to presentation`);
    }
  }

  // --- controllers must not import PrismaClient -----------------------------
  if (
    file.startsWith('presentation' + path.sep + 'controllers' + path.sep) &&
    file !== 'presentation/controllers/health.controller.ts'
  ) {
    if (/PrismaClient/.test(clean)) {
      errors.push(`${file}: controller imports PrismaClient — route data access through a use case`);
    }
  }

  // --- no process.env outside loadEnv() -------------------------------------
  if (
    file !== 'infrastructure/config/env.ts' &&
    file !== 'worker/worker-config.ts' && // its own process, its own env loader
    !KNOWN_DEBT.processEnv.has(file) &&
    /process\.env\b/.test(clean)
  ) {
    errors.push(`${file}: reads process.env directly — read it once via loadEnv() (CLAUDE.md)`);
  }

  // --- O: port interfaces are *Interface, in a *-interface.ts file -----------
  // The suffix goes at the END, spelled out. A leading `I` is Hungarian
  // notation that reads as noise at the point of use, and `i-` sorted every
  // port away from the thing it describes in a file listing. Same rule as the
  // app repo's rule O, so one vocabulary spans both sides of the wire.
  const isPortFile = /^[a-z0-9-]+-interface\.ts$/.test(path.basename(file));
  for (const m of src.matchAll(/^export interface (\w+)/gm)) {
    const name = m[1];
    if (/^I[A-Z]\w+$/.test(name)) {
      errors.push(`${file}: port interface ${name} uses the I* prefix — name it ${name.slice(1)}Interface (CLAUDE.md §O)`);
    } else if (name.endsWith('Interface') && !isPortFile) {
      errors.push(`${file}: port interface ${name} must live in a '*-interface.ts' file (CLAUDE.md §O)`);
    }
  }

  // --- A: one declaration per file (blocking; KNOWN_DEBT.shape) ----------------------------
  if (isBarrel(file)) continue;
  const declRe = /^export\s+(?:default\s+)?(interface|type|class|enum|abstract class|const|function)\s+([A-Za-z0-9_]+)/gm;
  const decls = [...src.matchAll(declRe)].map((m) => ({ kind: m[1].replace('abstract ', ''), name: m[2] }));
  const names = new Set(decls.map((d) => d.name));
  const classes = decls.filter((d) => d.kind === 'class');

  let typeLike = decls.filter((d) => d.kind === 'interface' || d.kind === 'type' || d.kind === 'enum');
  // Supporting shapes named alongside a use case / port never count as a
  // second declaration — an XInput next to a class XUseCase is the pattern
  // the whole application layer uses, not an accident.
  const SUPPORTING_SUFFIXES = ['Input', 'Result', 'Data', 'Credentials', 'Query', 'Verdict', 'Hit', 'Snapshot', 'Context'];
  typeLike = typeLike.filter((d) => !SUPPORTING_SUFFIXES.some((suffix) => d.name.endsWith(suffix)));
  // Exception: a class's own helper types (constructor options, etc).
  if (classes.length >= 1) typeLike = [];
  // Exception: a port-interface file's request/reply shapes beside its I*.
  if (isPortFile && typeLike.some((d) => d.name.endsWith('Interface'))) typeLike = [];
  // Exception: same-name const+type merge, and unions derived via
  // `typeof <local const>` — the zod `type X = z.infer<typeof XSchema>` idiom
  // every validator file uses.
  typeLike = typeLike.filter((d) => {
    if (d.kind !== 'type') return true;
    const body = new RegExp(`^export\\s+type\\s+${d.name}\\b[^=]*=([\\s\\S]*?)(;|$)`, 'm').exec(src)?.[1] ?? '';
    const derived = [...body.matchAll(/typeof\s+([A-Za-z0-9_]+)/g)].some((t) => names.has(t[1]));
    const merged = decls.some((o) => o !== d && o.kind === 'const' && o.name === d.name);
    return !derived && !merged;
  });

  const primaryCount = typeLike.length + classes.length;
  if (primaryCount > 1) {
    reportOnly.push(
      `${file}: one-declaration-per-file — ${[...typeLike, ...classes].map((d) => `${d.kind} ${d.name}`).join(', ')}`,
    );
  }
}

// --- I: folder file-count guard ----------------------------------------------
const SOFT_FILE_LIMIT = 10;
const HARD_FILE_LIMIT = 15;
const COUNT_EXEMPT = /(^|\/)(__tests__|__fixtures__|__mocks__)(\/|$)/;
// One file per custom AdminJS field is AdminJS's convention, not ours — see
// ADMIN_COMPONENTS above.

const folderCounts = new Map();
for (const file of files) {
  const dir = path.dirname(file);
  if (COUNT_EXEMPT.test(dir) || isAdminComponent(file)) continue;
  folderCounts.set(dir, (folderCounts.get(dir) ?? 0) + 1);
}
const crowded = [];
for (const [dir, count] of folderCounts) {
  if (count > HARD_FILE_LIMIT) {
    errors.push(`${dir}/: ${String(count)} files — over the ${String(HARD_FILE_LIMIT)}-file hard limit; group the related ones into subfolders`);
  } else if (count > SOFT_FILE_LIMIT) {
    crowded.push(`${dir}/ (${String(count)})`);
  }
}
if (crowded.length > 0 && process.env.CI !== 'true') {
  console.warn(
    `check:structure — ${String(crowded.length)} folder(s) past the ${String(SOFT_FILE_LIMIT)}-file soft limit; look for a grouping before adding another:\n` +
      crowded.sort().map((c) => '  · ' + c).join('\n'),
  );
}

// --- K: no unguarded console.* in src/, outside infrastructure/logger/ ------
{
  for (const file of files) {
    if (isTest(file) || file.startsWith('infrastructure' + path.sep + 'logger' + path.sep)) continue;
    const lines = stripComments(fs.readFileSync(path.join(SRC, file), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (!/\bconsole\.(log|warn|error|info|debug)\s*\(/.test(line)) return;
      errors.push(`${file}:${String(i + 1)}: unguarded console.* — use the injected LoggerInterface instead`);
    });
  }
}

// --- every Failure subclass has a failure-to-http case -----------------------
{
  const FAILURE_TO_HTTP = 'presentation/http/failure-to-http.ts';
  const codes = new Set();
  for (const file of files) {
    if (isTest(file)) continue;
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    for (const m of src.matchAll(/class\s+\w+\s+extends\s+Failure\s*\{[^}]*?readonly code = '([a-z_]+)'/gs)) {
      codes.add(m[1]);
    }
  }
  const httpPath = path.join(SRC, FAILURE_TO_HTTP);
  if (fs.existsSync(httpPath)) {
    const httpSrc = fs.readFileSync(httpPath, 'utf8');
    const cased = new Set([...httpSrc.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]));
    const hasDefault = /default:/.test(httpSrc);
    // 'unknown' is the one code deliberately left to the `default:` 500 — it
    // has no field/messageKey handling of its own to add. Every other code
    // must have an explicit case or a new Failure silently falls through.
    for (const code of codes) {
      if (cased.has(code)) continue;
      if (code === 'unknown' && hasDefault) continue;
      errors.push(`${FAILURE_TO_HTTP}: no case for Failure code '${code}' — add one to statusForCode()`);
    }
  }
}

// --- F: file size guard (blocking; KNOWN_DEBT.shape) ----------------------------------------
{
  // Composition roots assemble the whole app in one place on purpose; they
  // will never shrink, and forcing a split would scatter the one place that
  // shows how everything is wired.
  const COMPOSITION_ROOT_EXEMPT = new Set(['presentation/server/bootstrap.ts', 'infrastructure/admin/adminjs.ts']);
  const isMapper = (f) => f.startsWith('infrastructure/prisma/mappers/');
  const isEntityLike = (f) => f.startsWith('domain/') && !/^i-[a-z0-9-]+\.ts$/.test(path.basename(f));
  const isUseCase = (f) => f.includes('/use-cases/');

  for (const file of files) {
    if (isTest(file) || COMPOSITION_ROOT_EXEMPT.has(file)) continue;
    const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split('\n').length;
    const [limit, category] = isUseCase(file)
      ? [200, 'use case']
      : isEntityLike(file) || isMapper(file)
        ? [150, 'entity/mapper']
        : [400, 'file'];
    if (lines > limit) {
      reportOnly.push(`${file}: ${String(lines)} lines — over the ${String(limit)}-line ${category} guideline`);
    }
  }
}

// --- P: every top-level folder under src/ is a layer -------------------------
// The gate reasons about layers. Anything parked beside them is, by
// construction, code no rule in this file has ever looked at — which is exactly
// what `locales/` and `types/` were until they moved into the layers that own
// them. Blocking here is what stops the next one from appearing.
{
  for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (entry.isDirectory() && !LAYERS.includes(entry.name)) {
      errors.push(
        `src/${entry.name}/ is not a layer — every folder under src/ must be one of ${LAYERS.join(', ')}; ` +
          'put it inside the layer that owns it (assets belong next to their consumer)',
      );
    } else if (entry.isFile()) {
      errors.push(`src/${entry.name} sits outside every layer — move it into the layer that owns it`);
    }
  }
}

// --- V: no vocabulary spelled out where a name exists -----------------------
// A word the app discriminates on gets ONE const-object definition, and every
// other site points at it — INCLUDING the discriminated union that consumes it
// (`{ readonly status: typeof ModerationStatus.Approved }`).
//
// `ImportJobStatus` already carries the reasoning: "a string literal repeated
// across a boundary is a typo waiting to become a job nobody ever claims,
// because a `WHERE status = 'queud'` does not fail — it returns no rows." The
// moderation vocabulary was the same shape and had not learned it: 'approved',
// 'rejected' and 'pending' were typed out across 31 files in all four layers,
// two of which declared their own parallel unions of the same three words. A
// comment stuck at the wrong status is invisible — it simply never appears.
{
  const VOCABULARIES = [
    { def: 'domain/moderation/moderation-status.ts', name: 'ModerationStatus', words: ['approved', 'rejected', 'pending'] },
    { def: 'domain/imports/import-job-status.ts', name: 'ImportJobStatus', words: ['queued', 'running', 'done', 'failed'] },
    { def: 'domain/ai/ai-generation-status.ts', name: 'AIGenerationStatus', words: ['success', 'failed'] },
  ];
  for (const file of files) {
    if (isTest(file)) continue;
    const src = stripComments(fs.readFileSync(path.join(SRC, file), 'utf8'));
    for (const { def, name, words } of VOCABULARIES) {
      if (file.endsWith(def)) continue;
      for (const word of words) {
        // Only where the literal is used AS the value — assigned, compared,
        // listed in an enum, matched against a set, or handed to a call
        // (`setModerationStatus('approved')`). A word inside a sentence is not
        // the vocabulary.
        //
        // Case-insensitive on the key, and that is the whole point: the first
        // version of this rule anchored on a lowercase `status`, so
        // `moderationStatus: 'approved'` — the spelling at roughly thirty of
        // the sites it was written to protect — did not match. A guard that
        // misses the dominant spelling of its own vocabulary is decoration.
        const used = new RegExp(
          `(?:[a-z]*status\\s*[:=]\\s*|decision\\s*:\\s*|[=!]==\\s*|z\\.enum\\(\\[[^\\]]*|in\\s*:\\s*\\[[^\\]]*|\\(\\s*)'${word}'`,
          'i',
        );
        if (used.test(src)) {
          // 'failed' belongs to both ImportJobStatus and AIGenerationStatus,
          // so naming only the first match sent the author to the wrong
          // vocabulary. Offer every definition that claims the word.
          const owners = VOCABULARIES.filter((v) => v.words.includes(word));
          const suggestion = owners
            .map((v) => `${v.name} from @${v.def.replace(/\.ts$/, '')}`)
            .join(' or ');
          errors.push(`${file}: '${word}' spelled out — use ${suggestion}`);
        }
      }
    }
  }
}

// --- L: every message key a Failure carries must exist in every catalogue ----
// i18next answers an unknown key with the key itself, so a mistyped or simply
// never-added key does not fail anywhere: it rides out on the wire as
// `message: "errors.unauthorized.invalid_credentials"` and the user reads that.
// Nothing was watching this — 31 keys, the login failure among them, were being
// thrown by code that no catalogue defined. Two halves, both mechanical:
//   1. every key constructed in a `new *Failure('...')` exists in en.json;
//   2. every other locale carries exactly en.json's key set.
// `import-notification-keys.ts` already wrote this lesson down for the
// notification keys; this is the same lesson applied to the error catalogue.
{
  const LOCALES = path.join(SRC, 'infrastructure', 'i18n', 'locales', 'errors');
  const EN = path.join(LOCALES, 'en.json');
  if (fs.existsSync(EN)) {
    const en = JSON.parse(fs.readFileSync(EN, 'utf8'));
    const known = new Set(Object.keys(en));

    for (const file of files) {
      if (isTest(file)) continue;
      const src = stripComments(fs.readFileSync(path.join(SRC, file), 'utf8'));
      // ANY catalogue-shaped literal, wherever it is written. Anchoring on the
      // construction site was the mistake twice over: it missed the
      // `messageKey:` object form, and it missed a key assigned to a variable
      // first (`content-blocked-failure.ts` picks one of two with a ternary,
      // then constructs). A key is a key wherever it is spelled, and the
      // catalogue is the only thing that can confirm it.
      const KEY_SITE = /['"`]((?:errors|auth|ai|notifications)\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)['"`]/g;
      for (const m of src.matchAll(KEY_SITE)) {
        if (known.has(m[1])) continue;
        errors.push(`${file}: message key '${m[1]}' is in no catalogue — add it to every file in infrastructure/i18n/locales/errors/`);
      }
    }

    for (const name of fs.readdirSync(LOCALES)) {
      if (!name.endsWith('.json') || name === 'en.json') continue;
      const other = JSON.parse(fs.readFileSync(path.join(LOCALES, name), 'utf8'));
      const has = new Set(Object.keys(other));
      for (const key of known) {
        if (!has.has(key)) errors.push(`i18n/locales/errors/${name}: missing '${key}' — every catalogue carries en.json's key set`);
      }
      for (const key of has) {
        if (!known.has(key)) errors.push(`i18n/locales/errors/${name}: '${key}' is not in en.json — en.json is the catalogue of record`);
      }
    }
  }
}

// --- J: PROJECT-MAP.md must describe the tree that exists --------------------
{
  const mapPath = path.join(ROOT, 'PROJECT-MAP.md');
  if (!fs.existsSync(mapPath)) {
    errors.push('PROJECT-MAP.md is missing — run `npm run map`');
  } else {
    const { fingerprint } = await import('./generate-map.mjs');
    const recorded = /<!-- fingerprint: ([a-f0-9]+) -->/.exec(fs.readFileSync(mapPath, 'utf8'))?.[1];
    if (recorded !== fingerprint()) {
      errors.push('PROJECT-MAP.md is stale — run `npm run map`');
    }
  }
}

// Shape findings block unless the file is on the debt list, and the debt list
// is itself checked: an entry nothing matches any more is reported so the set
// shrinks as the code is fixed instead of quietly describing work already done.
{
  const excused = new Set();
  for (const finding of new Set(reportOnly)) {
    const file = finding.slice(0, finding.indexOf(':'));
    if (KNOWN_DEBT.shape.has(file)) { excused.add(file); continue; }
    errors.push(finding);
  }
  for (const file of KNOWN_DEBT.shape) {
    if (!excused.has(file)) {
      errors.push(`KNOWN_DEBT.shape lists '${file}', which no longer violates anything — delete the entry`);
    }
  }
  if (excused.size > 0) {
    console.warn(`check:structure — ${String(excused.size)} file(s) on the shape debt list; burn them down, never add:\n`);
    for (const f of [...excused].sort()) console.warn('  · ' + f);
    console.warn('');
  }
}

if (errors.length) {
  console.error(`check:structure — ${errors.length} violation(s):\n`);
  for (const e of [...new Set(errors)].sort()) console.error('  ' + e);
  process.exit(1);
}
console.log('check:structure — OK');
