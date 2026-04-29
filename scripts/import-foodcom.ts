// Imports recipes from the Food.com Kaggle CSV into the local DB. One-shot dev
// utility — runs locally with tsx; not bundled into the production image.
//
// Usage:
//   npx tsx scripts/import-foodcom.ts --file ./data/RAW_recipes.csv --limit 200
//
// Idempotent: each row maps to a stable food.com canonical URL; the Recipe
// table has a unique index on source_url, so re-running upserts existing rows
// instead of duplicating.
//
// LICENSE NOTE: Kaggle metadata says CC0 but the underlying recipes are scraped
// from food.com (commercial site). Use this for dev/portfolio sandbox only —
// confirm per-recipe licensing before serving on a public commercial product.

import { createReadStream } from 'fs';
import { parse as parseCsv } from 'csv-parse';
import { PrismaClient, Difficulty } from '@prisma/client';

const IMPORT_BOT_EMAIL = 'import-bot@recipely.local';
const FOODCOM_RECIPE_BASE = 'https://www.food.com/recipe';
const UNSPLASH_BASE = 'https://source.unsplash.com/featured/600x400';

const KNOWN_CUISINES = new Set([
  'italian', 'mexican', 'chinese', 'french', 'indian', 'japanese', 'thai',
  'greek', 'spanish', 'turkish', 'korean', 'vietnamese', 'mediterranean',
  'american', 'german', 'middle-eastern', 'african', 'cajun', 'tex-mex',
]);

const KNOWN_MEAL_TYPES = new Set([
  'breakfast', 'brunch', 'lunch', 'dinner', 'snack', 'dessert', 'beverage', 'appetizer',
]);

interface CliOptions {
  file: string;
  limit: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--file' || flag === '--limit') {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${flag}`);
      args[flag.slice(2)] = value;
      i++;
    }
  }
  if (!args.file) {
    throw new Error('Usage: import-foodcom --file <path> [--limit N]');
  }
  return {
    file: args.file,
    limit: args.limit ? Number.parseInt(args.limit, 10) : 200,
  };
}

// Food.com CSVs serialize ingredients/steps/tags as Python list literals
// (single quotes, embedded escapes). JSON.parse can't read them; we approximate
// by swapping quote style. Accepts malformed rows by returning [].
function parsePyList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];
  try {
    const swapped = trimmed
      .replace(/\\'/g, '__APOS__')
      .replace(/'/g, '"')
      .replace(/__APOS__/g, "'");
    const parsed = JSON.parse(swapped) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function difficultyFromMinutes(minutes: number): Difficulty {
  if (minutes <= 30) return Difficulty.EASY;
  if (minutes <= 90) return Difficulty.MEDIUM;
  return Difficulty.HARD;
}

function pickCuisine(tags: string[]): string {
  const match = tags.find((t) => KNOWN_CUISINES.has(t.toLowerCase()));
  return match ? match.toLowerCase() : 'world';
}

function pickMealTypes(tags: string[]): string[] {
  const found = new Set<string>();
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (KNOWN_MEAL_TYPES.has(lower)) found.add(lower);
  }
  return [...found];
}

interface FoodComRow {
  name?: string;
  id?: string;
  minutes?: string;
  tags?: string;
  steps?: string;
  ingredients?: string;
}

interface MappedRecipe {
  name: string;
  cuisine: string;
  difficulty: Difficulty;
  ingredients: string[];
  instructions: string[];
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  image: string;
  rating: number;
  tags: string[];
  mealType: string[];
  isPublished: boolean;
  sourceUrl: string;
  ownerId: string;
}

function mapRow(row: FoodComRow, ownerId: string): MappedRecipe | null {
  const name = row.name?.trim();
  if (!name) return null;
  const id = row.id?.trim();
  if (!id) return null;

  const minutes = Number.parseInt(row.minutes ?? '0', 10);
  const tags = parsePyList(row.tags);
  const ingredients = parsePyList(row.ingredients);
  const instructions = parsePyList(row.steps);

  if (ingredients.length === 0 || instructions.length === 0) return null;

  const slug = slugify(name);
  const sourceUrl = `${FOODCOM_RECIPE_BASE}/${slug}-${id}`;
  const image = `${UNSPLASH_BASE}/?food,${encodeURIComponent(slug)}`;

  return {
    name: name.slice(0, 200),
    cuisine: pickCuisine(tags),
    difficulty: difficultyFromMinutes(Number.isFinite(minutes) && minutes > 0 ? minutes : 30),
    ingredients: ingredients.slice(0, 50),
    instructions: instructions.slice(0, 50),
    prepTimeMinutes: 0,
    cookTimeMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 30,
    image,
    rating: 0,
    tags: tags.slice(0, 10),
    mealType: pickMealTypes(tags),
    isPublished: true,
    sourceUrl,
    ownerId,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const bot = await prisma.user.findUnique({ where: { email: IMPORT_BOT_EMAIL } });
    if (!bot) {
      throw new Error(
        `Import bot user not found (${IMPORT_BOT_EMAIL}). Run: node prisma/seed.js`,
      );
    }

    const parser = createReadStream(opts.file).pipe(
      parseCsv({ columns: true, skip_empty_lines: true, relax_quotes: true }),
    );

    let inserted = 0;
    let skipped = 0;
    let mapFailed = 0;
    let processed = 0;

    for await (const rawRow of parser) {
      if (inserted + skipped >= opts.limit) break;
      processed++;

      const row = rawRow as FoodComRow;
      const mapped = mapRow(row, bot.id);
      if (!mapped) {
        mapFailed++;
        continue;
      }

      try {
        const result = await prisma.recipe.upsert({
          where: { sourceUrl: mapped.sourceUrl },
          create: mapped,
          update: {},
        });
        // Distinguish create vs no-op by re-checking existence: simpler to just
        // count via createdAt proximity to now, but cleanest is a flag from try.
        // Prisma upsert doesn't return that flag, so compare createdAt vs updatedAt.
        const wasJustCreated =
          Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;
        if (wasJustCreated) {
          inserted++;
          console.log(`[${inserted + skipped}/${opts.limit}] inserted: ${mapped.name}`);
        } else {
          skipped++;
          console.log(`[${inserted + skipped}/${opts.limit}] skipped (exists): ${mapped.name}`);
        }
      } catch (err) {
        console.warn(`[skip] ${mapped.name}: ${(err as Error).message}`);
      }
    }

    console.log('---');
    console.log(`Processed: ${processed}, mapped: ${inserted + skipped}, inserted: ${inserted}, skipped: ${skipped}, mapFailed: ${mapFailed}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[import] Failed:', err);
  process.exit(1);
});
