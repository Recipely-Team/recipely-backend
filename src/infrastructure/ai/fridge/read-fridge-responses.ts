import { z } from 'zod';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import { INGREDIENT_CONFIDENCES, IngredientConfidence } from '@domain/fridge/ingredient-confidence';
import { Difficulty } from '@domain/recipes/difficulty';
import type { DetectedIngredient } from '@application/fridge/ports/fridge-scanner-interface';
import type { SuggestedIdea } from '@application/fridge/ports/fridge-idea-generator-interface';
import { FridgeLimits } from '@application/fridge/fridge-limits';
import { extractJsonBlock } from '@infrastructure/ai/recipe-prompt';

const DIFFICULTIES = [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard] as const;
const MAX_LIST = 40;

const IngredientSchema = z.object({
  name: z.string().trim().min(1).max(FridgeLimits.ingredientMaxChars * 2),
  confidence: z.enum(INGREDIENT_CONFIDENCES).catch(IngredientConfidence.Low),
});

const IdeaSchema = z.object({
  title: z.string().trim().min(1).max(FridgeLimits.titleMaxChars * 2),
  summary: z.string().trim().min(1),
  totalMinutes: z.coerce.number().finite().positive().transform((n) => Math.min(Math.round(n), FridgeLimits.maxTotalMinutes)),
  difficulty: z.string().transform((s) => s.toUpperCase()).pipe(z.enum(DIFFICULTIES)),
  uses: z.array(z.string()).max(MAX_LIST),
  missing: z.array(z.string()).max(MAX_LIST),
});

const unavailable = (): Result<never, Failure> => fail(new ServiceUnavailableFailure('errors.fridge.unavailable'));

function parseEnvelope(raw: string, key: 'ingredients' | 'ideas'): unknown[] | null {
  try {
    const json: unknown = JSON.parse(extractJsonBlock(raw));
    const list = (json as Record<string, unknown> | null)?.[key];
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

/**
 * Reads a scan answer, item by item.
 *
 * @remarks
 * Not JSON, or no `ingredients` array, is a failure the caller answers by
 * asking the next provider; one malformed item is dropped and the rest kept.
 * An unreadable confidence reads as `low`. Logs nothing of the answer.
 */
export function readFridgeScanResponse(raw: string): Result<DetectedIngredient[], Failure> {
  const items = parseEnvelope(raw, 'ingredients');
  if (items === null) return unavailable();
  const ingredients: DetectedIngredient[] = [];
  for (const candidate of items.slice(0, FridgeLimits.maxScanIngredients * 2)) {
    const parsed = IngredientSchema.safeParse(candidate);
    if (parsed.success) ingredients.push(parsed.data);
  }
  return ok(ingredients);
}

/**
 * Reads an ideas answer. Fewer than the ideas asked for, once malformed ones
 * are dropped, is garble: the caller asks the next provider.
 */
export function readFridgeIdeasResponse(raw: string): Result<SuggestedIdea[], Failure> {
  const items = parseEnvelope(raw, 'ideas');
  if (items === null) return unavailable();
  const ideas: SuggestedIdea[] = [];
  for (const candidate of items) {
    const parsed = IdeaSchema.safeParse(candidate);
    if (parsed.success) ideas.push(parsed.data);
  }
  return ideas.length < FridgeLimits.ideasPerRequest ? unavailable() : ok(ideas);
}
