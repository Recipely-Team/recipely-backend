import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaType } from '@domain/recipes/recipe-media';

export interface MediaDto {
  readonly id: string;
  readonly type: MediaType;
  readonly url: string;
  readonly position: number;
}

export interface RecipeDto {
  readonly id: string;
  readonly name: string;
  readonly cuisine: string;
  readonly difficulty: Difficulty;
  readonly ingredients: string[];
  readonly instructions: string[];
  readonly prepTimeMinutes: number;
  readonly cookTimeMinutes: number;
  readonly servings: number;
  readonly caloriesPerServing: number;
  readonly image: string;
  readonly rating: number;
  readonly tags: string[];
  readonly mealType: string[];
  readonly media: MediaDto[];
  readonly ownerId: string;
  readonly nutrition?: { readonly protein?: number | undefined; readonly carbs?: number | undefined; readonly fat?: number | undefined; readonly fiber?: number | undefined; };
  readonly createdAt: string; // ISO
  readonly updatedAt: string; // ISO
}

export interface PagedRecipesDto {
  readonly items: RecipeDto[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
