import type { Difficulty } from '@domain/recipes/difficulty';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { PageResult } from '@domain/common/page-result';

export type RecipeSort =
  | 'popular'
  | 'rating'
  | 'time'
  | 'name'
  | 'newest'
  | 'mostLiked'
  | 'alphabetical'
  | 'mostCommented';

export interface RecipeQuery {
  readonly search?: string;
  readonly ownerId?: string;
  readonly cuisines?: CuisineKey[];
  readonly categories?: RecipeCategory[];
  readonly difficulties?: Difficulty[];
  readonly maxTime?: number;
  readonly sort?: RecipeSort;
  readonly sortOrder?: 'asc' | 'desc';
  readonly includeUnpublished?: boolean;
  readonly currentUserId?: string;
  readonly likedOnly?: boolean;
  readonly locale: string;
  readonly page: number;   // 1-based
  readonly pageSize: number;
}

export type { PageResult };

export interface RecipeSocialData {
  readonly likeCount: number;
  readonly likedByMe: boolean;
  readonly commentCount: number;
}

export interface RecipePageResult extends PageResult<Recipe> {
  readonly socialByRecipeId: ReadonlyMap<string, RecipeSocialData>;
}

export interface RecipeWithSocial {
  readonly recipe: Recipe;
  readonly social: RecipeSocialData;
}
