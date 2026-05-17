import type { Difficulty } from '@domain/recipes/difficulty';
import type { Recipe } from '@domain/recipes/recipe';

export type RecipeSort = 'popular' | 'rating' | 'time' | 'name';

export interface RecipeQuery {
  readonly search?: string;
  readonly ownerId?: string;
  readonly cuisines?: string[];
  readonly difficulties?: Difficulty[];
  readonly maxTime?: number;
  readonly sort?: RecipeSort;
  readonly includeUnpublished?: boolean;
  readonly currentUserId?: string;
  readonly locale: string;
  readonly page: number;   // 1-based
  readonly pageSize: number;
}

export interface PageResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface RecipeSocialData {
  readonly likeCount: number;
  readonly likedByMe: boolean;
}

export interface RecipePageResult extends PageResult<Recipe> {
  readonly socialByRecipeId: ReadonlyMap<string, RecipeSocialData>;
}

export interface RecipeWithSocial {
  readonly recipe: Recipe;
  readonly social: RecipeSocialData;
}
