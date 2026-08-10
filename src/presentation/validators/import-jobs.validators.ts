import { z } from 'zod';
import { Difficulty } from '@domain/recipes/difficulty';

/**
 * Caps on what a worker may report back.
 *
 * @remarks
 * A worker is trusted to have run an import, not to have run a *sane* one: it
 * relays whatever a language model produced. Without bounds a model that loops
 * turns one reply into a multi-megabyte draft that every later read of that
 * user's drafts list has to carry. The numbers are generous enough that no real
 * recipe reaches them.
 */
const MAX_TEXT = 2000;
const MAX_SHORT_TEXT = 300;
const MAX_LIST_ITEMS = 100;
const MAX_MINUTES = 60 * 24;
const MAX_SERVINGS = 100;
const MAX_CALORIES = 100_000;
const MAX_GRAMS = 10_000;
/** ~2 MB of JPEG once decoded; a keyframe is an order of magnitude smaller. */
const MAX_COVER_BASE64 = 2_800_000;

export const EnqueueImportBodySchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

export type EnqueueImportBody = z.infer<typeof EnqueueImportBodySchema>;

export const ImportJobIdParamSchema = z.object({
  id: z.string().uuid(),
});

const shortList = z.array(z.string().trim().max(MAX_SHORT_TEXT)).max(MAX_LIST_ITEMS);

export const CompleteImportJobBodySchema = z.object({
  recipe: z.object({
    title: z.string().trim().min(1).max(MAX_SHORT_TEXT),
    cuisine: z.string().trim().max(MAX_SHORT_TEXT),
    category: z.string().trim().max(MAX_SHORT_TEXT),
    difficulty: z.enum([Difficulty.Easy, Difficulty.Medium, Difficulty.Hard]),
    prepTimeMinutes: z.number().int().min(0).max(MAX_MINUTES),
    cookTimeMinutes: z.number().int().min(0).max(MAX_MINUTES),
    servings: z.number().int().min(1).max(MAX_SERVINGS),
    ingredients: z.array(z.string().trim().max(MAX_TEXT)).max(MAX_LIST_ITEMS),
    instructions: z.array(z.string().trim().max(MAX_TEXT)).max(MAX_LIST_ITEMS),
    tags: shortList,
    mealType: shortList,
    tips: z.array(z.string().trim().max(MAX_TEXT)).max(MAX_LIST_ITEMS),
    caloriesPerServing: z.number().min(0).max(MAX_CALORIES),
    nutrition: z.object({
      protein: z.number().min(0).max(MAX_GRAMS),
      carbs: z.number().min(0).max(MAX_GRAMS),
      fat: z.number().min(0).max(MAX_GRAMS),
      fiber: z.number().min(0).max(MAX_GRAMS),
    }),
  }),
  coverFrameJpegBase64: z.string().max(MAX_COVER_BASE64).nullable(),
  locale: z.string().trim().min(2).max(10),
});

export type CompleteImportJobBody = z.infer<typeof CompleteImportJobBodySchema>;

export const FailImportJobBodySchema = z.object({
  /**
   * Constrained to a key shape on purpose. A worker that could send free text
   * would be writing the sentence the user reads, in whatever language the
   * worker happened to be thinking in, bypassing the translation catalogue
   * entirely.
   */
  errorKey: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_.]+$/, 'errors.validation.invalid_error_key'),
});

export type FailImportJobBody = z.infer<typeof FailImportJobBodySchema>;
