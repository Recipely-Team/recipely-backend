import { z } from 'zod';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';
import { RECIPE_CATEGORY_VALUES, type RecipeCategory } from '@domain/recipes/recipe-category';
import { CUISINE_KEY_VALUES, type CuisineKey } from '@domain/recipes/cuisine-key';

const localizedString = z.record(z.string(), z.string().trim().min(1));
const localizedStringArray = z.record(z.string(), z.array(z.string().trim().min(1)));

const csvOrArrayDifficulty = z
  .union([z.string(), z.array(z.string())])
  .transform(v => (Array.isArray(v) ? v : v.split(',')))
  .transform(v => v.map(s => s.trim().toUpperCase()))
  .pipe(z.array(z.enum(['EASY', 'MEDIUM', 'HARD'])).max(3))
  .optional();

// Query strings arrive as raw strings; `z.coerce.boolean()` would treat
// the literal "false" as truthy. Map the canonical strings explicitly.
const booleanQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform(v => v === true || v === 'true' || v === '1')
  .optional();

// Build typed Zod enums from the domain value arrays.
// `z.enum` requires a non-empty literal tuple; we cast once here and get
// proper string-literal output types throughout.
const recipeCategoryEnum = z.enum(RECIPE_CATEGORY_VALUES as [RecipeCategory, ...RecipeCategory[]]);
const cuisineKeyEnum = z.enum(CUISINE_KEY_VALUES as [CuisineKey, ...CuisineKey[]]);

const csvOrArrayCategory = z
  .union([z.string(), z.array(z.string())])
  .transform(v => (Array.isArray(v) ? v : v.split(',')))
  .transform(v => v.map(s => s.trim().toUpperCase()))
  .pipe(z.array(recipeCategoryEnum).max(11))
  .optional();

const csvOrArrayCuisine = z
  .union([z.string(), z.array(z.string())])
  .transform(v => (Array.isArray(v) ? v : v.split(',')))
  .transform(v => v.map(s => s.trim().toUpperCase()))
  .pipe(z.array(cuisineKeyEnum).max(15))
  .optional();

export const ListRecipesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  // `cuisines` is now an enum CSV; the old free-text string array is replaced.
  cuisines: csvOrArrayCuisine,
  categories: csvOrArrayCategory,
  difficulties: csvOrArrayDifficulty,
  maxTime: z.coerce.number().int().min(1).max(24 * 60).optional(),
  // Legacy sort values are preserved for backward compatibility.
  // `alphabetical` sorts by createdAt desc because the JSON name column cannot
  // be ordered natively via Prisma without raw SQL.
  sort: z.enum([
    'popular', 'rating', 'time', 'name',
    'newest', 'mostLiked', 'alphabetical', 'mostCommented',
  ]).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  locale: z.string().optional(),
  likedOnly: booleanQuery,
  personalize: booleanQuery,
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
  cuisine: cuisineKeyEnum,
  category: recipeCategoryEnum,
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
  tips: z.record(z.string(), z.array(z.string())).optional(),
  locale: z.string().optional(),
});

export type CreateRecipeBody = z.infer<typeof CreateRecipeBodySchema>;

export const UpdateRecipeBodySchema = z
  .object({
    name: localizedString.optional(),
    cuisine: cuisineKeyEnum.optional(),
    category: recipeCategoryEnum.optional(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    ingredients: localizedStringArray.optional(),
    instructions: localizedStringArray.optional(),
    prepTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
    cookTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
    servings: z.number().int().min(1).max(99).optional(),
    caloriesPerServing: z.number().int().min(0).max(10_000).optional(),
    image: z.string().url().max(2048).optional(),
    rating: z.number().min(0).max(5).optional(),
    tags: localizedStringArray.optional(),
    mealType: localizedStringArray.optional(),
    media: z.array(mediaItem).max(20).optional(),
    nutrition: z
      .object({
        protein: z.number().min(0).optional(),
        carbs: z.number().min(0).optional(),
        fat: z.number().min(0).optional(),
        fiber: z.number().min(0).optional(),
      })
      .optional(),
    tips: z.record(z.string(), z.array(z.string())).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'Request body must contain at least one field to update',
  });

export type UpdateRecipeBody = z.infer<typeof UpdateRecipeBodySchema>;
