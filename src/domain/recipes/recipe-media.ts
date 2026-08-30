export type MediaType = 'image' | 'video';

export const isMediaType = (s: string): s is MediaType => s === 'image' || s === 'video';

export interface RecipeMedia {
  readonly id: string;
  readonly type: MediaType;
  readonly url: string;
  readonly position: number;
}

/**
 * A photo on its way in: the row does not exist yet, so it has no id, and its
 * position is the repository's to assign — appending is the only thing anyone
 * can ask for, and two callers racing must not both claim the same slot.
 */
export interface NewRecipeMedia {
  readonly type: MediaType;
  readonly url: string;
}
