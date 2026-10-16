/**
 * Told when a recipe becomes visible to everyone — published by its owner,
 * approved by an admin, or saved public by an older client. Runs off the
 * request path and never fails the change that triggered it.
 */
export interface RecipeWentPublicListenerInterface {
  wentPublic(recipeId: string): void;
}
