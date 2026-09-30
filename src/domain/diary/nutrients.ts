import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { DiaryLimits } from '@domain/diary/diary-limits';

export interface NutrientValues {
  readonly calories: number;
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly fiber: number | null;
}

const TENTHS = 10;
const roundTenth = (value: number): number => Math.round(value * TENTHS) / TENTHS;

/**
 * Energy and macros for some amount of food — kcal as a whole number, grams to
 * one decimal.
 *
 * @remarks
 * - **Rounded on the way in**, so every stored value, total and scaled copy has
 *   the same precision and a day's sum never shows `0.30000000000000004`.
 * - **Fiber is optional** because many recipes carry no fiber figure; `null`
 *   means "unknown", not zero, and survives scaling as `null`.
 */
export class Nutrients {
  private constructor(readonly values: NutrientValues) {}

  static create(values: NutrientValues): Result<Nutrients, ValidationFailure> {
    const { calories, protein, carbs, fat, fiber } = values;
    if (!Number.isFinite(calories) || calories < 0 || calories > DiaryLimits.EntryCaloriesMax) {
      return fail(new ValidationFailure('errors.validation.nutrient_invalid', 'calories'));
    }
    for (const [field, grams] of [['protein', protein], ['carbs', carbs], ['fat', fat], ['fiber', fiber ?? 0]] as const) {
      if (!Number.isFinite(grams) || grams < 0 || grams > DiaryLimits.EntryMacroMax) {
        return fail(new ValidationFailure('errors.validation.nutrient_invalid', field));
      }
    }
    return ok(Nutrients.rounded(values));
  }

  /** A total over many entries — held to no per-entry cap, only rounded. */
  static total(values: NutrientValues): Nutrients {
    return Nutrients.rounded(values);
  }

  static zero(): Nutrients {
    return new Nutrients({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  }

  /** Summed for a day's totals — an unknown fiber counts as none. */
  plus(other: Nutrients): Nutrients {
    return Nutrients.rounded({
      calories: this.values.calories + other.values.calories,
      protein: this.values.protein + other.values.protein,
      carbs: this.values.carbs + other.values.carbs,
      fat: this.values.fat + other.values.fat,
      fiber: (this.values.fiber ?? 0) + (other.values.fiber ?? 0),
    });
  }

  scale(factor: number): Nutrients {
    return Nutrients.rounded({
      calories: this.values.calories * factor,
      protein: this.values.protein * factor,
      carbs: this.values.carbs * factor,
      fat: this.values.fat * factor,
      fiber: this.values.fiber === null ? null : this.values.fiber * factor,
    });
  }

  private static rounded(values: NutrientValues): Nutrients {
    return new Nutrients({
      calories: Math.round(values.calories),
      protein: roundTenth(values.protein),
      carbs: roundTenth(values.carbs),
      fat: roundTenth(values.fat),
      fiber: values.fiber === null ? null : roundTenth(values.fiber),
    });
  }
}
