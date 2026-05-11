import { z } from 'zod';
import { Difficulty } from '@domain/recipes/difficulty';

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
  return [
    `You are a professional chef and recipe writer.`,
    `Generate a complete cooking recipe based on the user's request.`,
    `Write all human-readable text fields (title, cuisine, ingredients, instructions, tags, mealType) in ${lang}.`,
    `Respond with ONLY a JSON object matching this exact schema, no markdown, no commentary:`,
    `{`,
    `  "title": string,`,
    `  "cuisine": string,`,
    `  "difficulty": "EASY" | "MEDIUM" | "HARD",`,
    `  "prepTimeMinutes": integer >= 0,`,
    `  "cookTimeMinutes": integer >= 0,`,
    `  "servings": integer >= 1,`,
    `  "caloriesPerServing": integer >= 0,`,
    `  "ingredients": string[] (e.g. "2 cups flour"),`,
    `  "instructions": string[] (ordered steps),`,
    `  "tags": string[],`,
    `  "mealType": string[] (e.g. ["dessert"], ["breakfast"])`,
    `}`,
  ].join('\n');
}

// Schema the AI output must match. Keep it lenient on extras (passthrough)
// but strict on required fields and types — adapters call this to convert
// raw model output into a typed result.
export const GeneratedRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  cuisine: z.string().trim().min(1).max(80),
  difficulty: z.enum([Difficulty.Easy, Difficulty.Medium, Difficulty.Hard]),
  prepTimeMinutes: z.number().int().min(0).max(24 * 60),
  cookTimeMinutes: z.number().int().min(0).max(24 * 60),
  servings: z.number().int().min(1).max(99),
  caloriesPerServing: z.number().int().min(0).max(10_000),
  ingredients: z.array(z.string().trim().min(1)).min(1).max(50),
  instructions: z.array(z.string().trim().min(1)).min(1).max(50),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  mealType: z.array(z.string().trim().min(1)).max(10).default([]),
});

export type ParsedGeneratedRecipe = z.infer<typeof GeneratedRecipeSchema>;

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
