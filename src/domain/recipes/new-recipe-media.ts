import type { MediaType } from '@domain/recipes/recipe-media';

/**
 * A photo on its way in.
 *
 * Its own file rather than another declaration beside {@link RecipeMedia}: that
 * one already carries two, and a third would be a third thing to find in a file
 * named after the first. The row does not exist yet, so it has no id — and its
 * position is the repository's to assign, because appending is all anyone can
 * ask for and two uploads racing must not both claim the same slot.
 */
export interface NewRecipeMedia {
  readonly type: MediaType;
  readonly url: string;
}
