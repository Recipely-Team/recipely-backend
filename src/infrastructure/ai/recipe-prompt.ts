import { z } from 'zod';
import { Difficulty } from '@domain/recipes/difficulty';
import { CUISINE_KEY_VALUES } from '@domain/recipes/cuisine-key';
import { RECIPE_CATEGORY_VALUES } from '@domain/recipes/recipe-category';

// Plain-language descriptor for the response language. Keeping it in the
// prompt (rather than relying on the model to guess from the user input) gives
// reproducible localized output.
const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  tr: 'Turkish',
};

export function languageLabel(locale: string): string {
  return LANGUAGE_LABELS[locale] ?? 'English';
}

// Shared across providers — the same JSON contract regardless of who generates.
export function buildSystemInstruction(locale: string): string {
  const lang = languageLabel(locale);
  const cuisineList = CUISINE_KEY_VALUES.join(' | ');
  const categoryList = RECIPE_CATEGORY_VALUES.join(' | ');
  return [
    `You are a professional chef and recipe writer.`,
    `Generate a complete cooking recipe based on the user's request.`,
    `Write human-readable text fields (title, ingredients, instructions, tags, mealType) in ${lang}.`,
    `IMPORTANT: The "cuisine" and "category" fields MUST be one of the fixed enum keys below — do NOT translate them, do NOT invent new values, do NOT add suffixes. Pick the single best match. If nothing fits, use "OTHER" for cuisine.`,
    `Allowed cuisine values: ${cuisineList}`,
    `Allowed category values: ${categoryList}`,
    `Cuisine selection guidance: classify by the dish's primary culinary tradition (e.g. lasagna → ITALIAN, kebab → TURKISH, sushi → JAPANESE, taco → MEXICAN). Use OTHER only when the dish genuinely doesn't fit any listed cuisine.`,
    `Category selection guidance: pick the most specific category — pasta dishes → PASTA, pizza → PIZZA, soups → SOUP, stews/curries → STEW, breads → BREAD, baked goods/cakes/cookies → BAKING or DESSERT, sandwiches/burgers/wraps → SANDWICH, sauces/dips/dressings → SAUCE, salads → SALAD, drinks → DRINK or SMOOTHIE. Use MAIN_COURSE only when no more specific category fits.`,
    `Respond with ONLY a JSON object matching this exact schema, no markdown, no commentary:`,
    `{`,
    `  "title": string,`,
    `  "cuisine": one of [${cuisineList}],`,
    `  "category": one of [${categoryList}],`,
    `  "difficulty": "EASY" | "MEDIUM" | "HARD",`,
    `  "prepTimeMinutes": integer >= 0,`,
    `  "cookTimeMinutes": integer >= 0,`,
    `  "servings": integer >= 1,`,
    `  "caloriesPerServing": integer >= 0,`,
    `  "ingredients": string[] (e.g. "2 cups flour"),`,
    `  "instructions": string[] (ordered steps),`,
    `  "tags": string[],`,
    `  "mealType": string[] (e.g. ["dessert"], ["breakfast"]),`,
    `  "nutrition": {`,
    `    "protein": number (grams per serving),`,
    `    "carbs": number (grams per serving),`,
    `    "fat": number (grams per serving),`,
    `    "fiber": number (grams per serving)`,
    `  }`,
    `}`,
  ].join('\n');
}

// Schema the AI output must match. Keep it lenient on extras (passthrough)
// but strict on required fields and types — adapters call this to convert
// raw model output into a typed result.
// AI sometimes returns a near-miss (e.g. "ITALIAN_AMERICAN", localized text,
// extra whitespace). Tolerate it: keep cuisine/category as free strings here
// and let the use case map them to the enum (or fall back to OTHER/MAIN_COURSE).
// This avoids a hard schema failure that would lose the whole recipe over a
// classification quibble.
export const GeneratedRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  cuisine: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  difficulty: z.enum([Difficulty.Easy, Difficulty.Medium, Difficulty.Hard]),
  prepTimeMinutes: z.number().int().min(0).max(24 * 60),
  cookTimeMinutes: z.number().int().min(0).max(24 * 60),
  servings: z.number().int().min(1).max(99),
  caloriesPerServing: z.number().int().min(0).max(10_000),
  ingredients: z.array(z.string().trim().min(1)).min(1).max(50),
  instructions: z.array(z.string().trim().min(1)).min(1).max(50),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  mealType: z.array(z.string().trim().min(1)).max(10).default([]),
  nutrition: z.object({
    protein: z.number().min(0).max(500),
    carbs: z.number().min(0).max(1000),
    fat: z.number().min(0).max(500),
    fiber: z.number().min(0).max(100),
  }).default({ protein: 0, carbs: 0, fat: 0, fiber: 0 }),
});

export type ParsedGeneratedRecipe = z.infer<typeof GeneratedRecipeSchema>;

// System instruction for the refine flow: same enum/JSON contract as generate,
// but the model is told to apply an instruction to the current recipe and return
// the COMPLETE updated JSON, preserving any field not explicitly changed.
export function buildRefineSystemInstruction(locale: string): string {
  const lang = languageLabel(locale);
  const cuisineList = CUISINE_KEY_VALUES.join(' | ');
  const categoryList = RECIPE_CATEGORY_VALUES.join(' | ');
  return [
    `You are a professional chef and recipe writer.`,
    `You will receive a current recipe as JSON and an instruction from the user.`,
    `Apply the instruction to the current recipe and return the COMPLETE updated recipe JSON in the same schema.`,
    `Preserve all fields that are not mentioned in the instruction — do NOT omit or reset them.`,
    `Fill any empty or missing required fields with sensible defaults.`,
    `Write human-readable text fields (title, ingredients, instructions, tags, mealType) in ${lang}.`,
    `IMPORTANT: The "cuisine" and "category" fields MUST be one of the fixed enum keys below — do NOT translate them, do NOT invent new values, do NOT add suffixes. Pick the single best match. If nothing fits, use "OTHER" for cuisine.`,
    `Allowed cuisine values: ${cuisineList}`,
    `Allowed category values: ${categoryList}`,
    `Cuisine selection guidance: classify by the dish's primary culinary tradition (e.g. lasagna → ITALIAN, kebab → TURKISH, sushi → JAPANESE, taco → MEXICAN). Use OTHER only when the dish genuinely doesn't fit any listed cuisine.`,
    `Category selection guidance: pick the most specific category — pasta dishes → PASTA, pizza → PIZZA, soups → SOUP, stews/curries → STEW, breads → BREAD, baked goods/cakes/cookies → BAKING or DESSERT, sandwiches/burgers/wraps → SANDWICH, sauces/dips/dressings → SAUCE, salads → SALAD, drinks → DRINK or SMOOTHIE. Use MAIN_COURSE only when no more specific category fits.`,
    `Respond with ONLY a JSON object matching this exact schema, no markdown, no commentary:`,
    `{`,
    `  "title": string,`,
    `  "cuisine": one of [${cuisineList}],`,
    `  "category": one of [${categoryList}],`,
    `  "difficulty": "EASY" | "MEDIUM" | "HARD",`,
    `  "prepTimeMinutes": integer >= 0,`,
    `  "cookTimeMinutes": integer >= 0,`,
    `  "servings": integer >= 1,`,
    `  "caloriesPerServing": integer >= 0,`,
    `  "ingredients": string[] (e.g. "2 cups flour"),`,
    `  "instructions": string[] (ordered steps),`,
    `  "tags": string[],`,
    `  "mealType": string[] (e.g. ["dessert"], ["breakfast"]),`,
    `  "nutrition": {`,
    `    "protein": number (grams per serving),`,
    `    "carbs": number (grams per serving),`,
    `    "fat": number (grams per serving),`,
    `    "fiber": number (grams per serving)`,
    `  }`,
    `}`,
  ].join('\n');
}

// User message for the refine flow.
export function buildRefineUserMessage(currentRecipe: Record<string, unknown>, instruction: string): string {
  return `Current recipe: ${JSON.stringify(currentRecipe)}\nInstruction: ${instruction}`;
}

// Strips ```json fences and surrounding text some models add despite
// being told to emit raw JSON.
export function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw.trim();
}
