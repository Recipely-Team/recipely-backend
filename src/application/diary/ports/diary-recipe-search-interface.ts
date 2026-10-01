import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { Recipe } from '@domain/recipes/recipe';
import type { DiaryRecipeGroupType } from '@application/diary/diary-food-group';

export interface DiaryRecipeSearchQuery {
  readonly userId: string;
  /** Trimmed, non-empty. */
  readonly term: string;
  readonly group: DiaryRecipeGroupType;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Recipe matches for the diary's "Add food" search, one group at a time, each
 * paged. Matching is the home search's (every word, any locale, folded).
 *
 * @remarks
 * - `saved`: the user's favourites they can still read (live; published or theirs).
 * - `mine`: their own live recipes in any status, not already in `saved`.
 * - `recipes`: other users' published ones the user has not favourited.
 * - Each newest first; a recipe lands in one group only.
 */
export interface DiaryRecipeSearchInterface {
  search(query: DiaryRecipeSearchQuery): Promise<Result<PageResult<Recipe>, Failure>>;
}
