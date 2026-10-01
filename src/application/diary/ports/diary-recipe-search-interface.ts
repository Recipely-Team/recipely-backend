import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { Recipe } from '@domain/recipes/recipe';
import type { DiaryRecipeGroupType } from '@application/diary/diary-food-group';

export interface DiaryRecipeSearchQuery {
  readonly userId: string;
  /** Trimmed, non-empty; absent lists the group whole (see below). */
  readonly term?: string;
  readonly group: DiaryRecipeGroupType;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Recipe matches for the diary's "Add food" search, one group at a time, each
 * paged. Matching is the home search's (every word, any locale, folded).
 *
 * @remarks
 * - With a term, the groups split the matches so a recipe lands in one only:
 *   `saved` the user's favourites they can still read (live; published or
 *   theirs), `mine` their own live recipes in any status not already saved,
 *   `recipes` other users' published ones not saved — each newest first.
 * - Without a term, a group is the whole list the Recipes tab browses:
 *   `saved` every readable favourite, newest-saved first; `mine` every own
 *   live recipe, drafts included, newest first; `recipes` the public feed
 *   (every published recipe, newest first, as the home feed orders it).
 */
export interface DiaryRecipeSearchInterface {
  search(query: DiaryRecipeSearchQuery): Promise<Result<PageResult<Recipe>, Failure>>;
}
