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
import { findFreeImage, type FreeImage } from './seed-data/find-free-image';
import type { SeedRecipe } from './seed-data/seed-recipe';
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
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const PROVENANCE = path.join(process.cwd(), 'scripts', 'seed-data', 'seeded-images.json');
const SEED_OWNER_EMAIL = 'kitchen@recipely.net';
const MAX_DIMENSION = 1920;
const TIMEOUT_MS = 30_000;

const dryRun = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg === -1 ? ALL_RECIPES.length : Number(process.argv[limitArg + 1] ?? ALL_RECIPES.length);

if (BASE_URL === undefined && !dryRun) {
  console.error('BASE_URL is required (e.g. https://api.recipely.net) — refusing to bake a wrong host into the DB.');
  process.exit(1);
}

interface Provenance {
  [slug: string]: { file: string; licence: string; source: string; openverseId: string; title: string };
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
    const req = protocol.get(url, { timeout: TIMEOUT_MS }, (res) => {
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
async function storeImage(image: FreeImage): Promise<string> {
  const buffer = await download(image.url);
  const filename = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  const source = sharp(buffer);
  const meta = await source.metadata();
  const pipeline =
    meta.width !== undefined && meta.width > MAX_DIMENSION
      ? source.resize({ width: MAX_DIMENSION, withoutEnlargement: true })
      : source;
  await pipeline.jpeg({ quality: 82 }).toFile(path.join(UPLOADS_DIR, filename));
  return filename;
}

async function seedOwnerId(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: SEED_OWNER_EMAIL } });
  if (existing !== null) return existing.id;
  const created = await prisma.user.create({
    data: { email: SEED_OWNER_EMAIL, name: 'Recipely Kitchen', passwordHash: crypto.randomBytes(32).toString('hex') },
  });
  return created.id;
}

async function main(): Promise<void> {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const provenance = readProvenance();
  const ownerId = dryRun ? 'dry-run' : await seedOwnerId();
  const batch = ALL_RECIPES.slice(0, limit);

  let created = 0;
  let updated = 0;
  const withoutImage: string[] = [];

  for (const recipe of batch) {
    let record = provenance[recipe.slug];

    if (record === undefined) {
      const found = await findFreeImage(recipe.imageQuery, recipe.imageSubject);
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
      record = { file: await storeImage(found), licence: found.licence, source: found.source, openverseId: found.openverseId, title: found.title };
      provenance[recipe.slug] = record;
      fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
    }

    if (dryRun) continue;

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

  console.log(`\nseeded: ${created} new, ${updated} updated, ${withoutImage.length} skipped for want of a photograph`);
  if (withoutImage.length > 0) console.log('no image:', withoutImage.join(', '));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
