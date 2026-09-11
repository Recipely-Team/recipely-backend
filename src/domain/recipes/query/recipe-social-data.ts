/**
 * The counters a recipe carries for one viewer.
 *
 * Separate from the recipe itself because `likedByMe` is viewer-dependent: it
 * is a read-model concern, not identity-intrinsic state, and putting it on the
 * entity would make the same recipe two different objects for two readers.
 */
export interface RecipeSocialData {
  readonly likeCount: number;
  readonly likedByMe: boolean;
  readonly commentCount: number;
}
