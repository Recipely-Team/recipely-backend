import { z } from 'zod';

export const ListRecipesQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListRecipesQuery = z.infer<typeof ListRecipesQuerySchema>;

export const RecipeIdParamSchema = z.object({
  id: z.string().uuid('Recipe id must be a UUID'),
});

export const CreateRecipeBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  cuisine: z.string().trim().min(1).max(100),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  ingredients: z.array(z.string().trim().min(1)).min(1).max(50),
  instructions: z.array(z.string().trim().min(1)).min(1).max(50),
  prepTimeMinutes: z.number().int().min(0).max(24 * 60),
  cookTimeMinutes: z.number().int().min(0).max(24 * 60),
  image: z.string().url().max(2048),
  rating: z.number().min(0).max(5).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  mealType: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  isPublished: z.boolean().optional(),
});

export type CreateRecipeBody = z.infer<typeof CreateRecipeBodySchema>;
