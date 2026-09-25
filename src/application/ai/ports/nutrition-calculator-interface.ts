import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface NutritionInput {
  readonly ingredients: readonly string[];
  readonly servings: number;
  /** The method, so the cooked weight can account for water lost or absorbed. */
  readonly instructions?: readonly string[] | undefined;
}

export interface NutritionResult {
  readonly caloriesPerServing: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly fiber: number;
  /** Cooked weight of one serving, when the estimate was plausible. */
  readonly servingWeightGrams?: number | undefined;
}

export interface NutritionCalculatorInterface {
  calculate(input: NutritionInput): Promise<Result<NutritionResult, Failure>>;
}
