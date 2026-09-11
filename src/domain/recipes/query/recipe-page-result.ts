import type { PageResult } from '@domain/common/page-result';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeSocialData } from '@domain/recipes/query/recipe-social-data';

/**
 * A page of recipes plus the viewer-dependent counters for each.
 *
 * The social data travels beside the rows rather than inside them so one query
 * can answer for a whole page without the repository building a per-viewer
 * copy of every recipe.
 */
export interface RecipePageResult extends PageResult<Recipe> {
  readonly socialByRecipeId: ReadonlyMap<string, RecipeSocialData>;
}
