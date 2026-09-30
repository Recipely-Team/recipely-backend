import { z } from 'zod';
import { CuisineKey } from '@domain/recipes/cuisine-key';
import { Difficulty } from '@domain/recipes/difficulty';
import { RecipeCategory } from '@domain/recipes/recipe-category';
import { NutritionSource } from '@domain/recipes/curated/nutrition-source';

const text = z.string().trim().min(1);
const localizedText = z.object({ tr: text, en: text }).strict();
const localizedSteps = z.object({ tr: z.array(text).min(1), en: z.array(text).min(1) }).strict();
const localizedTags = z.object({ tr: z.array(text), en: z.array(text) }).strict();
const minutes = z.number().int().min(0).max(24 * 60);
const grams = z.number().min(0).max(1000);
const PHOTO_FILE_NAME = /^[\w.-]+\.(jpe?g|png|webp)$/i;

/**
 * One file of the curated dataset (`data/curated-recipes/<slug>.json`).
 *
 * @remarks
 * - **Shape only.** The quality gates (energy check, kcal band, ingredients in
 *   the steps, total time, credit licence) are the import use case's, so a
 *   file that fails one is reported with a reason rather than a parse error.
 *   That is also why `fdcId` / `grams` may be missing here and `license` is
 *   any string.
 * - `.strict()` throughout: a misspelt key is an error, not a silently
 *   dropped field.
 */
export const CuratedRecipeFileSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
    name: localizedText,
    category: z.nativeEnum(RecipeCategory),
    cuisine: z.nativeEnum(CuisineKey),
    difficulty: z.nativeEnum(Difficulty).default(Difficulty.Easy),
    servings: z.number().int().min(1).max(100),
    times: z.object({ prepMinutes: minutes, cookMinutes: minutes, totalMinutes: minutes }).strict(),
    ingredients: z
      .array(
        z
          .object({
            fdcId: z.number().int().positive().nullish(),
            grams: z.number().positive().max(10_000).nullish(),
            label: localizedText,
          })
          .strict(),
      )
      .min(1),
    steps: localizedSteps,
    nutrition: z
      .object({
        source: z.nativeEnum(NutritionSource),
        perServing: z
          .object({ kcal: z.number().min(0).max(5000), protein: grams, carbs: grams, fat: grams, fiber: grams })
          .strict(),
        servingWeightGrams: z.number().int().min(20).max(3000).optional(),
      })
      .strict(),
    image: z
      .object({
        // A bare file name beside the JSON file — never a path. The import
        // reads whatever this names, so '../' or '/etc/…' would be a file read.
        file: z.string().regex(PHOTO_FILE_NAME, 'a bare .jpg/.jpeg/.png/.webp file name, no path'),
        credit: z.object({ author: z.string(), license: z.string(), url: z.string() }).strict(),
      })
      .strict(),
    tags: localizedTags.optional(),
    mealType: localizedTags.optional(),
    reviewed: z.boolean().default(false),
    aiWritten: z.boolean().default(true),
  })
  .strict();

export type CuratedRecipeFile = z.infer<typeof CuratedRecipeFileSchema>;
