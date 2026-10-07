import { z } from 'zod';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { DetectedMealItem } from '@application/diary/ports/meal-parser-interface';
import { MealParseLimits } from '@application/diary/meal-parse-limits';
import { extractJsonBlock } from '@infrastructure/ai/recipe-prompt';

const MAX_KCAL = 5000;
const MAX_MACRO = 500;

const amount = (max: number) => z.coerce.number().finite().min(0).transform((n) => Math.min(Math.round(n * 10) / 10, max));

const ItemSchema = z.object({
  label: z.string().trim().min(1).transform((s) => s.slice(0, MealParseLimits.maxLabelChars)),
  searchTerm: z.string().trim().min(1).max(MealParseLimits.maxLabelChars),
  grams: z.coerce.number().finite().positive().transform((n) => Math.min(Math.round(n), MealParseLimits.maxGrams)),
  kcal: amount(MAX_KCAL),
  protein: amount(MAX_MACRO),
  carbs: amount(MAX_MACRO),
  fat: amount(MAX_MACRO),
  fiber: amount(MAX_MACRO),
  confidence: z.coerce.number().finite().transform((n) => Math.min(Math.max(n, 0), 1)),
});

const EnvelopeSchema = z.object({ items: z.array(z.unknown()) });

/**
 * Reads a model's meal answer, item by item.
 *
 * @remarks
 * - **Garble-safe.** Not JSON, or no `items` array, is a failure the caller
 *   answers by asking the next provider. One malformed item is dropped and the
 *   rest kept — a half-right plate is still useful to confirm.
 * - **Clamped, never trusted.** Portions, nutrients and confidence are bounded
 *   so a wild number cannot reach a diary.
 * - **Logs nothing** of the answer: it echoes what the user ate.
 */
export function readMealParseResponse(raw: string): Result<DetectedMealItem[], Failure> {
  let json: unknown;
  try {
    json = JSON.parse(extractJsonBlock(raw));
  } catch {
    return fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable'));
  }
  const envelope = EnvelopeSchema.safeParse(json);
  if (!envelope.success) return fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable'));

  const items: DetectedMealItem[] = [];
  for (const candidate of envelope.data.items.slice(0, MealParseLimits.maxItems)) {
    const parsed = ItemSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const { label, searchTerm, grams, kcal, protein, carbs, fat, fiber, confidence } = parsed.data;
    items.push({ label, searchTerm, grams, estimate: { kcal: Math.round(kcal), protein, carbs, fat, fiber }, confidence });
  }
  return ok(items);
}
