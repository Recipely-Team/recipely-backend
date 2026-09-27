/**
 * One photo still waiting for its focal point.
 *
 * `mediaId` is `null` for the recipe's cover (`recipes.image`) and the gallery
 * row's id otherwise — the two live in different tables, and the id is what a
 * write needs to find the right one.
 */
export interface PhotoFocusTarget {
  readonly recipeId: string;
  readonly mediaId: string | null;
  readonly url: string;
}
