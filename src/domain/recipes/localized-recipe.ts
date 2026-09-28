import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { ModerationStatus } from '@domain/moderation/moderation-status';
import type { RecipeMedia } from '@domain/recipes/recipe-media';
import type { FocalPoint } from '@domain/recipes/photos/focal-point';
import type { RecipeNutrition } from '@domain/recipes/recipe-nutrition';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { RecipeOriginType } from '@domain/recipes/recipe-origin';
import type { SourcePlatformType } from '@domain/recipes/source-platform';

/**
 * One recipe, flattened to a single language.
 *
 * A read model rather than an entity: it has no identity and no behaviour, it
 * is what `Recipe.toLocalized(locale)` hands a mapper. It lived beside the
 * entity until the entity outgrew its file — and it was the third exported
 * declaration in there, which is one more than the rule allows.
 */
export interface LocalizedRecipe {
  name: string;
  cuisine: CuisineKey;
  category: RecipeCategory;
  difficulty: Difficulty;
  ingredients: string[];
  instructions: string[];
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  caloriesPerServing: number;
  image: string;
  imageFocus?: FocalPoint;
  rating: number;
  tags: string[];
  mealType: string[];
  media: RecipeMedia[];
  ownerId: string;
  nutrition?: RecipeNutrition;
  tips?: string[];
  isPublished: boolean;
  moderationStatus: ModerationStatus;
  viewCount: number;
  origin: RecipeOriginType;
  sourceUrl?: string | undefined;
  sourceHandle?: string | undefined;
  /** Which platform an import came from; `null` when nothing was imported. */
  sourcePlatform: SourcePlatformType | null;
  /** Whether a model produced the text — true for a generation AND an import. */
  aiWritten: boolean;
  createdAt: Date;
  updatedAt: Date;
}
