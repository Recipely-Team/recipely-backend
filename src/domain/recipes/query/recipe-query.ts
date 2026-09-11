import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { RecipeSort } from '@domain/recipes/query/recipe-sort';

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
