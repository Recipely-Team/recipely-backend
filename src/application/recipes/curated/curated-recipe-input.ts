import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { NutritionSourceType } from '@domain/recipes/curated/nutrition-source';

interface LocalizedText {
  readonly tr: string;
  readonly en: string;
}

interface LocalizedList {
  readonly tr: readonly string[];
  readonly en: readonly string[];
}

/**
 * One curated recipe as a dataset file describes it, already shape-checked
 * (`curatedRecipeFileSchema`). What the shape cannot say — the quality gates —
 * is `curatedGateFailures`' job.
 *
 * @remarks
 * - `fdcId` and `grams` are optional HERE so a file missing one reaches the
 *   gate and is skipped with a reason, instead of dying in the parser.
 * - Nutrition is per serving and was computed from the FDC values by the
 *   pipeline; this side checks it, it never computes it.
 */
export interface CuratedRecipeInput {
  readonly slug: string;
  readonly name: LocalizedText;
  readonly category: RecipeCategory;
  readonly cuisine: CuisineKey;
  readonly difficulty: Difficulty;
  readonly servings: number;
  readonly times: { readonly prepMinutes: number; readonly cookMinutes: number; readonly totalMinutes: number };
  readonly ingredients: readonly {
    readonly fdcId?: number | null | undefined;
    readonly grams?: number | null | undefined;
    readonly label: LocalizedText;
  }[];
  readonly steps: LocalizedList;
  readonly nutrition: {
    readonly source: NutritionSourceType;
    readonly perServing: {
      readonly kcal: number;
      readonly protein: number;
      readonly carbs: number;
      readonly fat: number;
      readonly fiber: number;
    };
    readonly servingWeightGrams?: number | undefined;
  };
  readonly image: {
    /** The photo, relative to the dataset file. */
    readonly file: string;
    readonly credit: { readonly author: string; readonly license: string; readonly url: string };
  };
  readonly tags?: LocalizedList | undefined;
  readonly mealType?: LocalizedList | undefined;
  /** A person has checked a kcal value outside its category's band. */
  readonly reviewed: boolean;
  /** Whether a model wrote the text; the pipeline's steps are model-written. */
  readonly aiWritten: boolean;
}
