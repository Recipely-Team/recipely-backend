import { z } from 'zod';

// ---------- Recipes ----------
export const CreateRecipeBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  cuisine: z.string().trim().min(1).max(100),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  ingredients: z.array(z.string().trim().min(1)).min(1),
  instructions: z.array(z.string().trim().min(1)).min(1),
  prepTimeMinutes: z.number().int().min(0),
  cookTimeMinutes: z.number().int().min(0),
  image: z.string().trim().min(1),
  rating: z.number().min(0).max(5),
  tags: z.array(z.string().trim().min(1)).min(1),
  mealType: z.array(z.string().trim().min(1)).min(1),
  isPublished: z.boolean().default(false),
  ownerId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
});

export const UpdateRecipeBodySchema = CreateRecipeBodySchema.partial();

export const RecipeIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Categories ----------
export const CreateCategoryBodySchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(100),
});

export const UpdateCategoryBodySchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().trim().min(1).max(100).optional(),
});

export const CategoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Users ----------
export const UpdateUserBodySchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  photoUrl: z.string().url().nullable().optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export const UserIdParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------- Favorites ----------
export const DeleteFavoriteBodySchema = z.object({
  userId: z.string().uuid(),
  recipeId: z.string().uuid(),
});

// ---------- Feature Flags ----------
export const UpdateFeatureFlagBodySchema = z.object({
  enabled: z.boolean(),
});

export const FeatureFlagKeyParamSchema = z.object({
  key: z.string().min(1),
});
