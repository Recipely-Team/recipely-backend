import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaType } from '@domain/recipes/recipe-media';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { PageResult } from '@domain/common/page-result';

export interface MediaDto {
  readonly id: string;
  readonly type: MediaType;
  readonly url: string;
  readonly position: number;
}

export interface RecipeDto {
  readonly id: string;
  readonly name: string;
  readonly cuisine: CuisineKey;
  readonly category: RecipeCategory;
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
  readonly moderationStatus: string;
  readonly likeCount: number;
  readonly likedByMe: boolean;
  readonly commentCount: number;
  readonly viewCount: number;
  readonly createdAt: string; // ISO
  readonly updatedAt: string; // ISO
}

export type PagedRecipesDto = PageResult<RecipeDto>;
