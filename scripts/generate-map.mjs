#!/usr/bin/env node
/**
 * Regenerates PROJECT-MAP.md — the "where does X live?" index.
 *
 * WHY: a cold session's largest cost is not reading the rules, it is finding
 * things. Answering "where do recipe use cases live" with find/grep burns far
 * more context than reading one compact map. This is that map.
 *
 * It is GENERATED because a hand-written map rots the first week. `npm run map`
 * rewrites it and `check:structure` fails when it is stale, so it can never
 * quietly drift from the tree it describes.
 *
 * KEEP IT SMALL. The map only pays for itself while it is cheaper to read than
 * to grep — summarise folders, never enumerate every file.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'PROJECT-MAP.md');
// The same five layers + worker that check-structure.mjs walks — which is now
// all of src/. Nothing sits outside a layer any more: the i18n catalogues live
// under infrastructure/i18n/locales/ next to the only service that reads them,
// and the two ambient .d.ts files moved to the layers they describe. They still
// do not APPEAR in the map (it counts .ts files, and JSON and .d.ts are neither
// code the layer rules apply to nor things a reader navigates by), but they are
// no longer exceptions to where things may live.
const LAYERS = ['core', 'domain', 'application', 'infrastructure', 'presentation', 'worker'];

const isCode = (n) => /\.ts$/.test(n) && !n.endsWith('.d.ts');
const skip = (n) => n === '__tests__' || n === '__fixtures__' || n === '__mocks__';

const countFiles = (dir) => {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!skip(e.name)) n += countFiles(path.join(dir, e.name));
    } else if (isCode(e.name)) n += 1;
  }
  return n;
};

const subdirs = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !skip(e.name))
    .map((e) => e.name)
    .sort();

/** `feature/ — capability, capability (n files)` */
const featureLines = (layerDir) => {
  const out = [];
  for (const feature of subdirs(layerDir)) {
    const dir = path.join(layerDir, feature);
    const caps = subdirs(dir);
    const n = countFiles(dir);
    const detail = caps.length > 0 ? ` — ${caps.join(', ')}` : '';
    out.push(`- \`${feature}/\`${detail} _(${String(n)})_`);
  }
  return out;
};

const layer = (name) => path.join(SRC, name);

// ── presentation subsystems ──────────────────────────────────────────────
const presentationDir = path.join(SRC, 'presentation');
const PRESENTATION_PURPOSE = {
  controllers: 'thin adapters — parse the validated request, call one use case, map the result',
  http: 'failureToHttp: Failure.code → HTTP status + body',
  middlewares: 'auth, AES envelope (de/encrypt), async error boundary, rate limiting',
  routes: 'Express Router per feature; wires validator → controller',
  server: 'composition root — bootstrap.ts (DI), app.ts (Express app), index.ts (entry)',
  validators: 'Zod request schemas, one file per feature',
  types: 'ambient .d.ts — the Express `Request` augmentation auth middleware fills in',
};
const presentationLines = subdirs(presentationDir).map((d) => {
  const why = PRESENTATION_PURPOSE[d] ?? '';
  return `- \`${d}/\` — ${why} _(${String(countFiles(path.join(presentationDir, d)))})_`;
});

// ── worker ────────────────────────────────────────────────────────────────
const workerDir = path.join(SRC, 'worker');
const workerFiles = fs.existsSync(workerDir)
  ? fs
      .readdirSync(workerDir, { withFileTypes: true })
      .filter((e) => e.isFile() && isCode(e.name))
      .map((e) => e.name)
      .sort()
  : [];

const total = LAYERS.filter((l) => fs.existsSync(layer(l))).reduce((sum, l) => sum + countFiles(layer(l)), 0);

const body = `# Project map

**GENERATED — do not edit.** Run \`npm run map\` after moving or adding files;
\`npm run check:structure\` fails while this file is stale.

Read this before exploring: it answers "where does X live?" without a grep.
Rules live in [CLAUDE.md](CLAUDE.md). ${String(total)} source files across
core, domain, application, infrastructure, presentation, worker.

## Layers

\`core\` → nothing · \`domain\` → core · \`application\` → domain, core ·
\`infrastructure\` → application, domain, core · \`presentation\` → all four.
Never upward, with no exceptions.
\`worker/\` is a second, separate composition root (own process entry, own
\`@worker/*\` alias) and may import \`@infrastructure\` and \`@application\`
directly, the same way \`presentation/server/\` does.

## \`src/core/\` — Result, Failure, Entity — building blocks only

${featureLines(layer('core')).join('\n')}

## \`src/domain/\` — entities, value objects, repository interfaces

One folder per feature; files sit flat (no subfolders) — an entity, its value
objects, and its \`i-*-repository.ts\` port live side by side.

${featureLines(layer('domain')).join('\n')}

## \`src/application/\` — use cases, DTOs, mappers, ports

${featureLines(layer('application')).join('\n')}

## \`src/infrastructure/\` — repository impls, adapters, mappers, IO

${featureLines(layer('infrastructure')).join('\n')}

## \`src/presentation/\` — Express wiring

${presentationLines.join('\n')}

## \`src/worker/\` — the import pipeline's own process

Talks to the API over HTTPS only — no \`DATABASE_URL\`, no shared disk. Loads
its own env via \`worker-config.ts\` (never \`@infrastructure/config/env\`, which
is the API's schema and would demand vars a worker has no use for).

${workerFiles.map((f) => `- \`${f}\``).join(' · ')}

## Where to put a new thing

| Adding… | Goes in |
|---|---|
| A use case | \`application/<feature>/use-cases/\` |
| An entity or repository port | \`domain/<feature>/\` |
| A repository implementation | \`infrastructure/repositories/<feature>/\` |
| A Prisma row mapper | \`infrastructure/prisma/mappers/\` |
| A Zod request validator | \`presentation/validators/<feature>.validators.ts\` |
| A controller | \`presentation/controllers/<feature>.controller.ts\` |
| A route | \`presentation/routes/<feature>.routes.ts\`, mounted in \`server/app.ts\` |
| A migration | \`prisma/schema.prisma\` + \`npm run prisma:migrate:dev\` |
| An AdminJS resource | \`infrastructure/admin/adminjs.ts\` |
| A new Failure type | \`core/failure/\`, then a \`case\` in \`presentation/http/failure-to-http.ts\` |

## Commands

\`npm run dev\` · \`npm run build\` · \`npm run lint\` · \`npm run typecheck\` ·
\`npm test\` · \`npm run check:structure\` · \`npm run map\`

All four gates must be green before anything is done.
`;

/** Structural fingerprint — every folder and file name under the walked layers. */
export const fingerprint = () => {
  const parts = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (skip(e.name)) continue;
        parts.push('d:' + path.relative(SRC, p));
        walk(p);
      } else if (isCode(e.name)) parts.push('f:' + path.relative(SRC, p));
    }
  };
  for (const l of LAYERS) if (fs.existsSync(layer(l))) walk(layer(l));
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
};

export const render = () => `${body}\n<!-- fingerprint: ${fingerprint()} -->\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  fs.writeFileSync(OUT, render());
  const lines = render().split('\n').length;
  console.log(`PROJECT-MAP.md — ${String(lines)} lines, ~${String(Math.round(render().length / 4))} tokens`);
}
