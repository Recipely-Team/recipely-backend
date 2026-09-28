import { RecipeVisibility } from '@domain/recipes/publishing/recipe-visibility';
import { z } from 'zod';
import { ServingWeightGrams } from '@domain/recipes/recipe-nutrition';
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

// Clients (the app's recipe form included) send title-cased labels like
// "Turkish"/"Soup"/"Medium" rather than the raw uppercase enum constants.
// Normalize casing before validating against the enum — mirrors the
// csvOrArrayCategory/csvOrArrayCuisine/csvOrArrayDifficulty transforms above,
// which already do this for the list-query filters.
const uppercasedCuisineEnum = z
  .string()
  .transform(v => v.trim().toUpperCase())
  .pipe(cuisineKeyEnum);
const uppercasedCategoryEnum = z
  .string()
  .transform(v => v.trim().toUpperCase())
  .pipe(recipeCategoryEnum);
const uppercasedDifficultyEnum = z
  .string()
  .transform(v => v.trim().toUpperCase())
  .pipe(z.enum(['EASY', 'MEDIUM', 'HARD']));

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
    'newest', 'mostLiked', 'alphabetical', 'mostCommented', 'trending',
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

/** Both ids, because a photo is only ever addressed through its recipe. */
export const RecipeMediaParamSchema = z.object({
  id: z.string().uuid('Recipe id must be a UUID'),
  mediaId: z.string().uuid('Media id must be a UUID'),
});

const mediaItem = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().url().max(2048),
});

export const CreateRecipeBodySchema = z.object({
  name: localizedString,
  cuisine: uppercasedCuisineEnum,
  category: uppercasedCategoryEnum,
  difficulty: uppercasedDifficultyEnum,
  ingredients: localizedStringArray,
  instructions: localizedStringArray,
  prepTimeMinutes: z.number().int().min(0).max(24 * 60),
  cookTimeMinutes: z.number().int().min(0).max(24 * 60),
  servings: z.number().int().min(1).max(99).optional(),
  caloriesPerServing: z.number().int().min(0).max(10_000).optional(),
  // Optional: a recipe may be published without a cover. Requiring one meant a
  // recipe someone had written out in full could not be saved for want of a
  // photo, and it was what rejected a resumed draft whose device-local cover no
  // longer resolved. The domain has always tolerated an empty image — an
  // Instagram import whose cover frame fails to store writes exactly that.
  image: z.string().url().max(2048).optional(),
  rating: z.number().min(0).max(5).optional(),
  tags: localizedStringArray.optional(),
  mealType: localizedStringArray.optional(),
  media: z.array(mediaItem).max(20).optional(),
  nutrition: z.object({
    protein: z.number().min(0).optional(),
    carbs: z.number().min(0).optional(),
    fat: z.number().min(0).optional(),
    fiber: z.number().min(0).optional(),
    servingWeightGrams: z.number().int().min(ServingWeightGrams.Min).max(ServingWeightGrams.Max).optional(),
  }).optional(),
  tips: z.record(z.string(), z.array(z.string())).optional(),
  locale: z.string().optional(),
  // The draft this publish came from, so the server can retire it and send its
  // notifications on to the recipe. Optional: a recipe written from scratch has
  // no draft behind it.
  fromDraftId: z.string().uuid().optional(),
  // `private` saves to the owner's library; publishing is its own step. Absent
  // from older clients, which publish at creation as they always did.
  visibility: z.enum([RecipeVisibility.Private, RecipeVisibility.Public]).optional(),
});

export type CreateRecipeBody = z.infer<typeof CreateRecipeBodySchema>;

/**
 * `PATCH /recipes/:id` — the owner's edit of a private recipe. Every field is
 * the create schema's own rule, all optional; a localized field that is sent
 * replaces the whole record. An empty body is refused rather than treated as
 * an edit, because an edit is not free: it sends a recipe waiting in review
 * back to `unreviewed`.
 */
export const EditRecipeBodySchema = CreateRecipeBodySchema.pick({
  name: true,
  cuisine: true,
  category: true,
  difficulty: true,
  ingredients: true,
  instructions: true,
  prepTimeMinutes: true,
  cookTimeMinutes: true,
  servings: true,
  caloriesPerServing: true,
  tags: true,
  tips: true,
  nutrition: true,
})
  .partial()
  .refine((body) => Object.values(body).some((v) => v !== undefined), { message: 'errors.validation.nothing_to_edit' });

export type EditRecipeBody = z.infer<typeof EditRecipeBodySchema>;

export const TrendingRecipesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).optional(),
  locale: z.string().optional(),
});

export type TrendingRecipesQuery = z.infer<typeof TrendingRecipesQuerySchema>;
