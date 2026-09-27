import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaDto } from '@application/recipes/dtos/media.dto';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { PublishBlockerType } from '@domain/recipes/publishing/publish-blocker';

export interface RecipeDto {
  readonly id: string;
  readonly name: string;
  readonly cuisine: CuisineKey;
  readonly category: RecipeCategory;
  readonly difficulty: Difficulty;
  readonly ingredients: string[];
  readonly instructions: string[];
  readonly prepTimeMinutes: number;
  readonly cookTimeMinutes: number;
  readonly servings: number;
  readonly caloriesPerServing: number;
  readonly image: string;
  readonly rating: number;
  readonly tags: string[];
  readonly mealType: string[];
  readonly media: MediaDto[];
  /** The photo count list rows carry; the saved and liked tabs page full recipes, so they read it here. */
  readonly mediaCount: number;
  readonly ownerId: string;
  readonly nutrition?: { readonly protein?: number | undefined; readonly carbs?: number | undefined; readonly fat?: number | undefined; readonly fiber?: number | undefined; readonly servingWeightGrams?: number | undefined; };
  readonly tips?: string[];
  readonly moderationStatus: string;
  /** Visible to everyone. False for a private recipe, one in review and a rejected one; only the owner ever sees those. */
  readonly isPublished: boolean;
  readonly likeCount: number;
  readonly likedByMe: boolean;
  readonly commentCount: number;
  readonly viewCount: number;
  /**
   * Where the text came from — `USER`, `AI` or `IMPORT`.
   *
   * On the wire because the app puts a badge on it: a reader is entitled to
   * know whether a person wrote this or a machine did, and where it was lifted
   * from if it was lifted.
   */
  readonly origin: string;
  /** The post an import came from, when there is one. */
  readonly sourceUrl?: string;
  /** The account that posted it, without the '@'. */
  readonly sourceHandle?: string;
  /**
   * OWNER ONLY — absent for anyone else. What still keeps this recipe from
   * being published, in checklist order: `photo`, `ingredients`,
   * `instructions`. Empty when nothing does; only an unchanged web import is
   * ever blocked. Sent before the owner taps Publish, so the app can show the
   * checklist instead of discovering it from a 409.
   */
  readonly publishBlockers?: PublishBlockerType[];
  readonly createdAt: string; // ISO
  readonly updatedAt: string; // ISO
}
