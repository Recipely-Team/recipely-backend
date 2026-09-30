import type { ImageCreditDto } from '@application/recipes/dtos/image-credit.dto';
import type { SourcePlatformType } from '@domain/recipes/source-platform';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { FocusDto } from '@application/recipes/dtos/focus.dto';

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
  /** Where to centre a crop of the cover; absent means centred. */
  readonly imageFocus?: FocusDto;
  readonly cuisine: CuisineKey;
  readonly category: RecipeCategory;
  readonly difficulty: Difficulty;
  readonly totalTimeMinutes: number;
  /** kcal per serving, 0 when unknown — the same value the detail response carries. */
  readonly caloriesPerServing: number;
  readonly rating: number;
  readonly moderationStatus: string;
  /** Visible to everyone. False for a private recipe, one in review and a rejected one; only the owner ever sees those. */
  readonly isPublished: boolean;
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
  readonly sourcePlatform: SourcePlatformType | null;
  readonly aiWritten: boolean;
  /** The cover photo's credit — set on curated recipes, `null` on every other. */
  readonly imageCredit: ImageCreditDto | null;
  /** Where the nutrition was computed from (`USDA_FDC`), or `null` when it was estimated. */
  readonly nutritionSource: string | null;
  /**
   * How many photos the recipe has — the gallery's images, or 1 for a lone
   * cover — so a card can show a photo-count chip without the gallery itself.
   */
  readonly mediaCount: number;
}
