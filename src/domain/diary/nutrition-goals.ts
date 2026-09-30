import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { DiaryLimits } from '@domain/diary/diary-limits';

export interface NutritionGoalValues {
  readonly calories: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly fiber: number;
  readonly waterGlasses: number;
}

/** What a user aims for in a day. Unset goals read as `NutritionGoals.defaults()`. */
export class NutritionGoals {
  private static readonly DEFAULTS: NutritionGoalValues = {
    calories: 2000,
    protein: 120,
    carbs: 230,
    fat: 65,
    fiber: 30,
    waterGlasses: 8,
  };

  private constructor(readonly values: NutritionGoalValues) {}

  static defaults(): NutritionGoals {
    return new NutritionGoals(NutritionGoals.DEFAULTS);
  }

  static create(values: NutritionGoalValues): Result<NutritionGoals, ValidationFailure> {
    const { calories, protein, carbs, fat, fiber, waterGlasses } = values;
    if (!Number.isInteger(calories) || calories < DiaryLimits.GoalCaloriesMin || calories > DiaryLimits.GoalCaloriesMax) {
      return fail(new ValidationFailure('errors.validation.goal_invalid', 'calories'));
    }
    for (const [field, grams] of [['protein', protein], ['carbs', carbs], ['fat', fat], ['fiber', fiber]] as const) {
      if (!Number.isFinite(grams) || grams < 0 || grams > DiaryLimits.GoalMacroMax) {
        return fail(new ValidationFailure('errors.validation.goal_invalid', field));
      }
    }
    if (!Number.isInteger(waterGlasses) || waterGlasses < DiaryLimits.GoalWaterMin || waterGlasses > DiaryLimits.GoalWaterMax) {
      return fail(new ValidationFailure('errors.validation.goal_invalid', 'waterGlasses'));
    }
    return ok(new NutritionGoals(values));
  }
}
