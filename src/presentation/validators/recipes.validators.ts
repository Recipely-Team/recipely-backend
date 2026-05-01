import { z } from 'zod';

const localizedString = z.record(z.string(), z.string().trim().min(1));
const localizedStringArray = z.record(z.string(), z.array(z.string().trim().min(1)));

export const ListRecipesQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  locale: z.string().optional(),
});

export type ListRecipesQuery = z.infer<typeof ListRecipesQuerySchema>;

export const RecipeIdParamSchema = z.object({
  id: z.string().uuid('Recipe id must be a UUID'),
});

export const CreateRecipeBodySchema = z.object({
  name: localizedString,
  cuisine: localizedString,
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  ingredients: localizedStringArray,
  instructions: localizedStringArray,
  prepTimeMinutes: z.number().int().min(0).max(24 * 60),
  cookTimeMinutes: z.number().int().min(0).max(24 * 60),
  image: z.string().url().max(2048),
  rating: z.number().min(0).max(5).optional(),
  tags: localizedStringArray.optional(),
  mealType: localizedStringArray.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  isPublished: z.boolean().optional(),
  locale: z.string().optional(),
});

export type CreateRecipeBody = z.infer<typeof CreateRecipeBodySchema>;