// Seeds world recipes written for this repo, each with a CC0/public-domain
// photograph downloaded and served from our own host.
//
// Usage:
//   BASE_URL=https://api.recipely.net npx tsx scripts/seed-world-recipes.ts [--dry-run] [--limit N]
//
// Idempotent: matches on the English name, so re-running updates rather than
// duplicating. Images already downloaded are not fetched again.

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';
import sharp from 'sharp';
import { findFreeImage, imageUrlById, type FreeImage } from './seed-data/find-free-image';
import type { SeedRecipe } from './seed-data/seed-recipe';
import { AWAITING_PHOTOGRAPH } from './seed-data/awaiting-photograph';
import { TURKISH_RECIPES } from './seed-data/recipes-turkish';
import { MIDEAST_RECIPES } from './seed-data/recipes-mideast';
import { ITALIAN_RECIPES } from './seed-data/recipes-italian';
import { LATIN_RECIPES } from './seed-data/recipes-latin';
import { EAST_ASIA_RECIPES } from './seed-data/recipes-east-asia';
import { SOUTH_ASIA_RECIPES } from './seed-data/recipes-south-asia';
import { EUROPE_RECIPES } from './seed-data/recipes-europe';
import { EVERYDAY_RECIPES } from './seed-data/recipes-everyday';

const ALL_RECIPES: SeedRecipe[] = [
  ...TURKISH_RECIPES, ...MIDEAST_RECIPES, ...ITALIAN_RECIPES, ...LATIN_RECIPES,
  ...EAST_ASIA_RECIPES, ...SOUTH_ASIA_RECIPES, ...EUROPE_RECIPES, ...EVERYDAY_RECIPES,
];

// A slug is the identity a re-run matches on, so two dishes sharing one would
// silently overwrite each other.
const duplicateSlugs = ALL_RECIPES.map((r) => r.slug).filter((s, at, all) => all.indexOf(s) !== at);
if (duplicateSlugs.length > 0) {
  console.error(`duplicate slugs: ${[...new Set(duplicateSlugs)].join(', ')}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL;
/**
 * The one place a downloaded photograph is kept.
 *
 * @remarks
 * - **Why a cache and not the emit folder** — a slug already in the provenance
 *   file skips its download, and when the download was also what wrote the file
 *   into the emit folder, a second `--emit` run produced SQL naming 59 images
 *   and a folder holding none of them. The rows loaded, the pictures did not.
 */
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const PROVENANCE = path.join(process.cwd(), 'scripts', 'seed-data', 'seeded-images.json');
const SEED_OWNER_EMAIL = 'kitchen@recipely.net';
const MAX_DIMENSION = 1920;
const TIMEOUT_MS = 30_000;
/**
 * Wikimedia refuses anonymous automated requests with a 403, and its policy
 * asks for a descriptive agent that identifies the tool and a contact. Most of
 * these photographs are hosted there, so without this the run stops on the
 * first one.
 */
const DOWNLOAD_AGENT = 'Recipely-Seed/1.0 (https://recipely.net; recept2534@gmail.com)';

const dryRun = process.argv.includes('--dry-run');
/**
 * Stages images and SQL locally instead of touching a database.
 *
 * The servers keep their uploads in a named Docker volume and their Postgres
 * off the host network, so nothing here can reach either directly. Emitting a
 * folder of images and a file of SQL means the same artefact can be reviewed,
 * copied to dev, and later copied to production — and that what runs against
 * production is the exact thing that ran against dev.
 */
const emitDir = argValue('--emit');

function argValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

/** A JSON column's value. Quotes are part of the JSON, so `'"Pad Thai"'` is right here. */
function sqlString(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

/**
 * A text value, for comparing against what `->>` extracts.
 *
 * @remarks
 * - **Why it is not `sqlString`** — `->>` returns the string *inside* the JSON,
 *   so `name->>'en' = '"Pad Thai"'` compares `Pad Thai` with `"Pad Thai"` and is
 *   never true. Every dish already in the database was inserted a second time.
 */
function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg === -1 ? ALL_RECIPES.length : Number(process.argv[limitArg + 1] ?? ALL_RECIPES.length);

if (BASE_URL === undefined && !dryRun) {
  console.error('BASE_URL is required (e.g. https://api.recipely.net) — refusing to bake a wrong host into the DB.');
  process.exit(1);
}

interface Provenance {
  [slug: string]: { file: string; licence: string; source: string; openverseId: string; title: string; url?: string };
}

function readProvenance(): Provenance {
  try {
    return JSON.parse(fs.readFileSync(PROVENANCE, 'utf8')) as Provenance;
  } catch {
    return {};
  }
}

function download(url: string, redirectsLeft = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: TIMEOUT_MS, headers: { 'User-Agent': DOWNLOAD_AGENT } }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location !== undefined) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error(`Too many redirects: ${url}`));
        return download(new URL(res.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${status} for ${url}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`Timed out: ${url}`)));
    req.on('error', reject);
  });
}

/** Downloads, normalises to JPEG and returns the stored filename. */
/**
 * Downloads a photograph into `outDir` and returns the name it was given.
 *
 * @remarks
 * - **`as`** — a re-fetch of a photograph already chosen keeps the name the
 *   provenance file recorded. A fresh name would mean the SQL emitted for
 *   production named a different file than the one dev was given, and the point
 *   of emitting is that both environments load the same artefact.
 */
async function storeImage(image: FreeImage, outDir: string, as?: string): Promise<string> {
  const buffer = await download(image.url);
  const filename = as ?? `${crypto.randomBytes(16).toString('hex')}.jpg`;
  // `failOn: none` because a stray byte before a JPEG marker is a warning in
  // every viewer and fatal to sharp's default. One such file cost a dish.
  const source = sharp(buffer, { failOn: 'none' });
  const meta = await source.metadata();
  const pipeline =
    meta.width !== undefined && meta.width > MAX_DIMENSION
      ? source.resize({ width: MAX_DIMENSION, withoutEnlargement: true })
      : source;
  await pipeline.jpeg({ quality: 82 }).toFile(path.join(outDir, filename));
  return filename;
}

async function seedOwnerId(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: SEED_OWNER_EMAIL } });
  if (existing !== null) return existing.id;
  const created = await prisma.user.create({
    data: { email: SEED_OWNER_EMAIL, displayName: 'Recipely Kitchen', passwordHash: crypto.randomBytes(32).toString('hex') },
  });
  return created.id;
}

async function main(): Promise<void> {
  const outDir = emitDir === undefined ? UPLOADS_DIR : path.join(emitDir, 'uploads');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const provenance = readProvenance();
  const ownerId = dryRun || emitDir !== undefined ? 'SEED_OWNER' : await seedOwnerId();
  const statements: string[] = [];
  // Written but not illustrated well enough to publish; see the module's note.
  const publishable = ALL_RECIPES.filter((r) => !AWAITING_PHOTOGRAPH.has(r.slug));
  const batch = publishable.slice(0, limit);
  console.log(`${publishable.length} publishable, ${ALL_RECIPES.length - publishable.length} awaiting a photograph`);

  let created = 0;
  let updated = 0;
  const withoutImage: string[] = [];

  for (const recipe of batch) {
    let record = provenance[recipe.slug];

    if (record === undefined) {
      // exactOnly: narrowing to a single word is what produced a church for
      // carbonara and a camera for brownie. The context word is the filter.
      // A search that fails is reported like a download that fails: one dish,
      // not the run. A 401 from a bad page size used to end it at the first.
      const found = await findFreeImage(recipe.imageQuery, recipe.imageSubject, true).catch((error: unknown) => {
        withoutImage.push(`${recipe.slug} (search failed: ${error instanceof Error ? error.message.slice(0, 60) : 'unknown'})`);
        return null;
      });
      if (found === null) {
        // No image is better than the wrong one, and better than a silent skip:
        // the dish is named at the end so it can be given a different query.
        withoutImage.push(`${recipe.slug} (${recipe.imageQuery})`);
        continue;
      }
      if (dryRun) {
        console.log(`  [dry] ${recipe.slug.padEnd(22)} ${found.licence.padEnd(8)} "${found.title.slice(0, 44)}"`);
        continue;
      }
      try {
        record = { file: await storeImage(found, UPLOADS_DIR), licence: found.licence, source: found.source, openverseId: found.openverseId, title: found.title, url: found.url };
      } catch (error: unknown) {
        // One unreachable host must not cost the other hundred dishes. The
        // name is reported at the end so it can be retried or re-queried.
        withoutImage.push(`${recipe.slug} (${error instanceof Error ? error.message.slice(0, 60) : 'download failed'})`);
        continue;
      }
      provenance[recipe.slug] = record;
      fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
    }

    if (dryRun) continue;

    if (!fs.existsSync(path.join(UPLOADS_DIR, record.file))) {
      // The provenance file remembers which photograph and where it came from;
      // only the bytes are gone, and the id is enough to fetch them again.
      const url = record.url ?? (await imageUrlById(record.openverseId));
      if (url === null) {
        withoutImage.push(`${recipe.slug} (cached image ${record.file} is gone and Openverse no longer serves ${record.openverseId})`);
        continue;
      }
      try {
        record = { ...record, url, file: await storeImage({ url, licence: record.licence, source: record.source, openverseId: record.openverseId, title: record.title }, UPLOADS_DIR, record.file) };
      } catch {
        withoutImage.push(`${recipe.slug} (re-download of ${record.file} failed)`);
        continue;
      }
      provenance[recipe.slug] = record;
      fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
    }

    if (emitDir !== undefined) {
      fs.copyFileSync(path.join(UPLOADS_DIR, record.file), path.join(outDir, record.file));
      // Matched on the English name, like the Prisma path below, so re-running
      // against a database that already has the dish updates it.
      statements.push(
        `INSERT INTO recipes (id, name, cuisine, category, difficulty, ingredients, instructions,` +
          ` prep_time_minutes, cook_time_minutes, total_time_minutes, servings, calories_per_serving,` +
          ` nutrition, tags, meal_type, image, rating, is_published, moderation_status, owner_id, created_at, updated_at)` +
          ` SELECT gen_random_uuid(), ${sqlString(recipe.name)}::json, '${recipe.cuisine}', '${recipe.category}',` +
          ` '${recipe.difficulty}', ${sqlString(recipe.ingredients)}::json, ${sqlString(recipe.instructions)}::json,` +
          ` ${recipe.prepTimeMinutes}, ${recipe.cookTimeMinutes}, ${recipe.prepTimeMinutes + recipe.cookTimeMinutes},` +
          ` ${recipe.servings}, ${recipe.caloriesPerServing}, ${sqlString(recipe.nutrition)}::json,` +
          ` ${sqlString(recipe.tags)}::json, ${sqlString(recipe.mealType)}::json,` +
          ` '${BASE_URL}/uploads/${record.file}', 0, true, 'approved', o.id, now(), now()` +
          ` FROM seed_owner o` +
          // Either language, because the app shows the Turkish name: a dish
          // already present as "Baked Lasagna" is the same "Fırın Lazanya".
          ` WHERE NOT EXISTS (SELECT 1 FROM recipes r WHERE (r.name->>'en' = ${sqlText(recipe.name.en)}` +
          ` OR r.name->>'tr' = ${sqlText(recipe.name.tr)}) AND r.deleted_at IS NULL);`,
      );
      created += 1;
      continue;
    }

    const data = {
      name: { tr: recipe.name.tr, en: recipe.name.en },
      cuisine: recipe.cuisine,
      category: recipe.category,
      difficulty: recipe.difficulty,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      totalTimeMinutes: recipe.prepTimeMinutes + recipe.cookTimeMinutes,
      servings: recipe.servings,
      caloriesPerServing: recipe.caloriesPerServing,
      nutrition: recipe.nutrition,
      tags: recipe.tags,
      mealType: recipe.mealType,
      image: `${BASE_URL}/uploads/${record.file}`,
      // Deliberately 0. A rating is what users think; a number written here
      // would be a claim about people who have not seen the dish.
      rating: 0,
      isPublished: true,
      moderationStatus: 'approved',
      ownerId,
    };

    const existing = await prisma.recipe.findFirst({
      where: { ownerId, name: { path: ['en'], equals: recipe.name.en } },
    });

    if (existing === null) {
      await prisma.recipe.create({ data });
      created += 1;
      console.log(`  + ${recipe.name.en}`);
    } else {
      await prisma.recipe.update({ where: { id: existing.id }, data });
      updated += 1;
      console.log(`  ~ ${recipe.name.en}`);
    }
  }

  if (emitDir !== undefined) {
    const header = [
      '-- Generated by scripts/seed-world-recipes.ts. Review before running.',
      "-- Requires the pgcrypto extension for gen_random_uuid().",
      'BEGIN;',
      'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
      "-- The account these recipes belong to. Created once, reused after.",
      `INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at)`,
      `SELECT gen_random_uuid(), '${SEED_OWNER_EMAIL}', 'Recipely Kitchen', md5(random()::text), 'user', now(), now()`,
      `WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = '${SEED_OWNER_EMAIL}');`,
      `CREATE TEMP VIEW seed_owner AS SELECT id FROM users WHERE email = '${SEED_OWNER_EMAIL}';`,
      '',
    ].join('\n');
    // Every filename the SQL names must be in the folder shipped beside it —
    // asserted rather than assumed, because the log used to print the statement
    // count twice and call the second one an image count.
    const named = [...new Set([...`${statements.join('\n')}`.matchAll(/\/uploads\/([^']+)/g)].map((m) => m[1]))];
    const jsonQuoted = statements.filter((line) => line.includes(`= '\"`));
    if (jsonQuoted.length > 0) {
      console.error(`refusing to emit: ${jsonQuoted.length} statement(s) compare a text column against a JSON-quoted literal, which is never equal`);
      process.exit(1);
    }
    const missing = named.filter((file) => !fs.existsSync(path.join(outDir, file)));
    if (missing.length > 0) {
      console.error(`refusing to emit: ${missing.length} image(s) named by the SQL are not in ${outDir}: ${missing.slice(0, 5).join(', ')}`);
      process.exit(1);
    }
    fs.writeFileSync(path.join(emitDir, 'seed.sql'), `${header}${statements.join('\n')}\nCOMMIT;\n`);
    console.log(`\nemitted: ${created} statements and ${named.length} images into ${emitDir}`);
    if (withoutImage.length > 0) console.log('no image:', withoutImage.join(', '));
    return;
  }

  console.log(`\nseeded: ${created} new, ${updated} updated, ${withoutImage.length} skipped for want of a photograph`);
  if (withoutImage.length > 0) console.log('no image:', withoutImage.join(', '));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
