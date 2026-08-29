#!/usr/bin/env node
/**
 * Mirrors every non-TypeScript file under `src/` into `dist/`, at the same
 * relative path.
 *
 * `tsc` only emits what it compiles, so the i18n catalogues
 * (`infrastructure/i18n/locales/errors/*.json`) would otherwise be missing from
 * the build output and every error message would resolve to its raw key. The
 * service locates them with `__dirname`, which means the built layout has to
 * mirror the source layout exactly — that mirroring is this script's whole job.
 *
 * Deliberately generic rather than a hard-coded locales copy: the next asset
 * someone drops next to its consumer ships without anyone remembering to come
 * back here.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

let copied = 0;
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(from);
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) continue;
    const to = path.join(DIST, path.relative(SRC, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied += 1;
  }
};

walk(SRC);
console.log(`copy-assets: ${copied} file(s) mirrored into dist/`);
