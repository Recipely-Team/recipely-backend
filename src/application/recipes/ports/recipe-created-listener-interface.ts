/**
 * Told about every recipe the moment it is saved, after the response is
 * decided. A listener does its work off the request path and never fails the
 * create: whatever it cannot do, a sweep picks up later.
 */
export interface RecipeCreatedListenerInterface {
  created(recipeId: string): void;
}
