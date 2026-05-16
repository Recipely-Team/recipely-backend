import { z } from 'zod';

const localizedString = z.record(z.string(), z.string().trim().min(1));
const localizedStringArray = z.record(z.string(), z.array(z.string().trim().min(1)));

// Repeated query params arrive as either ?cuisines=Italian&cuisines=Asian or
// the comma-separated form ?cuisines=Italian,Asian. Accept both.
const csvOrArray = z
  .union([z.string(), z.array(z.string())])
  .transform(v => (Array.isArray(v) ? v : v.split(',')))
  .pipe(z.array(z.string().trim().min(1).max(80)).max(20))
  .optional();

const csvOrArrayDifficulty = z
  .union([z.string(), z.array(z.string())])
  .transform(v => (Array.isArray(v) ? v : v.split(',')))
  .transform(v => v.map(s => s.trim().toUpperCase()))
  .pipe(z.array(z.enum(['EASY', 'MEDIUM', 'HARD'])).max(3))
  .optional();

export const ListRecipesQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  cuisines: csvOrArray,
  difficulties: csvOrArrayDifficulty,
  maxTime: z.coerce.number().int().min(1).max(24 * 60).optional(),
  sort: z.enum(['popular', 'rating', 'time', 'name']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  locale: z.string().optional(),
});

export type ListRecipesQuery = z.infer<typeof ListRecipesQuerySchema>;

export const RecipeIdParamSchema = z.object({
  id: z.string().uuid('Recipe id must be a UUID'),
});

const mediaItem = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().url().max(2048),
});

export const CreateRecipeBodySchema = z.object({
  name: localizedString,
  cuisine: localizedString,
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  ingredients: localizedStringArray,
  instructions: localizedStringArray,
  prepTimeMinutes: z.number().int().min(0).max(24 * 60),
  cookTimeMinutes: z.number().int().min(0).max(24 * 60),
  servings: z.number().int().min(1).max(99).optional(),
  caloriesPerServing: z.number().int().min(0).max(10_000).optional(),
  image: z.string().url().max(2048),
  rating: z.number().min(0).max(5).optional(),
  tags: localizedStringArray.optional(),
  mealType: localizedStringArray.optional(),
  media: z.array(mediaItem).max(20).optional(),
  nutrition: z.object({
    protein: z.number().min(0).optional(),
    carbs: z.number().min(0).optional(),
    fat: z.number().min(0).optional(),
    fiber: z.number().min(0).optional(),
  }).optional(),
  locale: z.string().optional(),
});

export type CreateRecipeBody = z.infer<typeof CreateRecipeBodySchema>;