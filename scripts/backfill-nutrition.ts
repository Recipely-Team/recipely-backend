// One-shot script: calculates nutrition for every recipe that has nutrition IS NULL.
// Calls Groq directly — bypasses HTTP auth. Run locally with the server's .env loaded.
//
// Usage (run from the repo root with env vars already exported):
//   export DATABASE_URL=... GROQ_API_KEY=...
//   npx tsx scripts/backfill-nutrition.ts
//
//   # or inline:
//   DATABASE_URL=... GROQ_API_KEY=... npx tsx scripts/backfill-nutrition.ts
//   BATCH_SIZE=10 npx tsx scripts/backfill-nutrition.ts   # override batch size
//
// Idempotent: only touches recipes where nutrition IS NULL. Safe to re-run.

import Groq from 'groq-sdk';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const BATCH_SIZE = parseInt(process.env['BATCH_SIZE'] ?? '20', 10);
const MODEL = process.env['AI_MODEL'] ?? 'llama-3.3-70b-versatile';
const GROQ_API_KEY = process.env['GROQ_API_KEY'] ?? '';

if (!GROQ_API_KEY) {
  console.error('❌  GROQ_API_KEY is not set. Export it before running.');
  process.exit(1);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

const NutritionSchema = z.object({
  caloriesPerServing: z.number().int().min(0).max(10_000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
  fiber: z.number().min(0).max(100),
});

const SYSTEM_PROMPT = [
  'You are a certified nutrition expert.',
  'Given a recipe\'s ingredient list and serving count, calculate the approximate nutritional information PER SERVING.',
  'Respond with ONLY a JSON object, no markdown, no commentary:',
  '{',
  '  "caloriesPerServing": integer (kcal per serving),',
  '  "protein": number (grams per serving),',
  '  "carbs": number (grams per serving),',
  '  "fat": number (grams per serving),',
  '  "fiber": number (grams per serving)',
  '}',
].join('\n');

async function calculateNutrition(
  ingredients: string[],
  servings: number,
): Promise<z.infer<typeof NutritionSchema> | null> {
  const userPrompt = `Servings: ${servings}\n\nIngredients:\n${ingredients.join('\n')}`;
  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });
    const raw = completion.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw) as unknown;
    const validated = NutritionSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn('  ⚠️  Schema mismatch:', validated.error.issues);
      return null;
    }
    return validated.data;
  } catch (err) {
    console.warn('  ⚠️  Groq error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`🥗  Recipely nutrition backfill — model: ${MODEL}, batch: ${BATCH_SIZE}`);

  let total = 0;
  let updated = 0;
  let failed = 0;
  const attemptedIds: string[] = [];

  for (;;) {
    const batch = await prisma.recipe.findMany({
      where: {
        nutrition: { equals: null },
        deletedAt: null,
        ...(attemptedIds.length > 0 ? { id: { notIn: attemptedIds } } : {}),
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        ingredients: true,
        servings: true,
      },
    });

    if (batch.length === 0) break;
    total += batch.length;
    console.log(`\nProcessing batch of ${batch.length} recipes (total attempted so far: ${total})...`);

    for (const row of batch) {
      attemptedIds.push(row.id);

      const ingredientsJson = row.ingredients as Record<string, string[]>;
      const ingredients =
        ingredientsJson['en'] ??
        (Object.values(ingredientsJson)[0] as string[] | undefined) ??
        [];

      const nameJson = row.name as Record<string, string>;
      const title = nameJson['en'] ?? nameJson['tr'] ?? Object.values(nameJson)[0] ?? row.id;

      if (ingredients.length === 0) {
        console.log(`  ⏭️  ${title} — no ingredients, skipping`);
        failed++;
        continue;
      }

      console.log(`  🔄  ${title} (${ingredients.length} ingredients, ${row.servings} servings)...`);
      const nutrition = await calculateNutrition(ingredients, row.servings);

      if (!nutrition) {
        failed++;
        continue;
      }

      await prisma.recipe.update({
        where: { id: row.id },
        data: {
          caloriesPerServing: nutrition.caloriesPerServing,
          nutrition: {
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fat: nutrition.fat,
            fiber: nutrition.fiber,
          },
        },
      });

      console.log(
        `  ✅  ${title} — ${nutrition.caloriesPerServing} kcal | P:${nutrition.protein}g C:${nutrition.carbs}g F:${nutrition.fat}g Fiber:${nutrition.fiber}g`,
      );
      updated++;
    }

    if (batch.length < BATCH_SIZE) break;
  }

  console.log(`\n🏁  Done. Updated: ${updated} | Failed/skipped: ${failed} | Total attempted: ${total}`);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
