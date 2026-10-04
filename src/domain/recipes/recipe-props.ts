import type { Difficulty } from '@domain/recipes/difficulty';
import type { RecipeOriginType } from '@domain/recipes/recipe-origin';
import type { SourcePlatformType } from '@domain/recipes/source-platform';
import type { ModerationStatus } from '@domain/moderation/moderation-status';
import type { RecipeMedia } from '@domain/recipes/recipe-media';
import type { FocalPoint } from '@domain/recipes/photos/focal-point';
import type { RecipeNutrition } from '@domain/recipes/recipe-nutrition';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { ImageCredit } from '@domain/recipes/curated/image-credit';
import type { NutritionSourceType } from '@domain/recipes/curated/nutrition-source';
import type { ImportedFingerprint } from '@domain/recipes/publishing/imported-fingerprint';

type LocalizedString = Record<string, string>;
type LocalizedStringArray = Record<string, string[]>;

/**
 * What a `Recipe` is built from.
 *
 * The imported fingerprint (`ImportedFingerprint`) rides along: it is what the
 * copyright gate compares the current text and photos against.
 */
export interface RecipeProps extends ImportedFingerprint {
  id: string;
  name: LocalizedString;
  cuisine: CuisineKey;
  category: RecipeCategory;
  difficulty: Difficulty;
  ingredients: LocalizedStringArray;
  instructions: LocalizedStringArray;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  caloriesPerServing: number;
  image: string;
  /** Where the dish sits in the cover; absent until the focus sweep finds it. */
  imageFocus?: FocalPoint | undefined;
  rating: number;
  tags: LocalizedStringArray;
  mealType: LocalizedStringArray;
  media: RecipeMedia[];
  ownerId: string;
  nutrition?: RecipeNutrition;
  tips?: Record<string, string[]>;
  isPublished: boolean;
  moderationStatus: ModerationStatus;
  viewCount: number;
  /** Where the text came from; see `RecipeOrigin`. */
  origin: RecipeOriginType;
  /** The post an import was lifted from. */
  sourceUrl?: string | undefined;
  /** The account that posted it, without the '@'. */
  sourceHandle?: string | undefined;
  /** Which platform it was imported from; `null` when nothing was. */
  sourcePlatform?: SourcePlatformType | null | undefined;
  /** Whether a model produced the text. True for a generation AND an import. */
  aiWritten?: boolean | undefined;
  /** The cover photo's credit; set only on curated recipes. */
  imageCredit?: ImageCredit | null | undefined;
  /** Where the nutrition was computed from; `null` when it was estimated. */
  nutritionSource?: NutritionSourceType | null | undefined;
  /** The curated import's key, unique per owner; `null` on every other recipe. */
  slug?: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}
