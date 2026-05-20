import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface NutritionInput {
  readonly ingredients: readonly string[];
  readonly servings: number;
}

export interface NutritionResult {
  readonly caloriesPerServing: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly fiber: number;
}

export interface INutritionCalculator {
  calculate(input: NutritionInput): Promise<Result<NutritionResult, Failure>>;
}
