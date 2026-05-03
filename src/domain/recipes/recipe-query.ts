import type { Difficulty } from '@domain/recipes/difficulty';

export type RecipeSort = 'popular' | 'rating' | 'time' | 'name';

export interface RecipeQuery {
  readonly search?: string;
  readonly categoryId?: string;
  readonly cuisines?: string[];
  readonly difficulties?: Difficulty[];
  readonly maxTime?: number;
  readonly sort?: RecipeSort;
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
