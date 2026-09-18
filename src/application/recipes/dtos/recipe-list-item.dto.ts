import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { RecipeCategory } from '@domain/recipes/recipe-category';

/**
 * What a feed row needs, and nothing more.
 *
 * Deliberately not a subset type of `RecipeDto`: a list row is its own contract
 * with the client, and deriving it would make every field the detail response
 * gains appear in the list payload the moment someone adds one.
 */
export interface RecipeListItemDto {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly cuisine: CuisineKey;
  readonly category: RecipeCategory;
  readonly difficulty: Difficulty;
  readonly totalTimeMinutes: number;
  readonly rating: number;
  readonly moderationStatus: string;
  readonly likeCount: number;
  readonly likedByMe: boolean;
  readonly commentCount: number;
  readonly viewCount: number;
  /**
   * Where the text came from, so a card can badge it.
   *
   * The card carries the origin and not the link: a badge that navigates off
   * the app from inside a feed is a trap, and the recipe it opens is where the
   * account belongs.
   */
  readonly origin: string;
}
