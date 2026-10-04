import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { DiaryLimits } from '@domain/diary/diary-limits';

export interface NutrientValues {
  readonly calories: number;
  readonly protein: number | null;
  readonly carbs: number | null;
  readonly fat: number | null;
  readonly fiber: number | null;
}

const TENTHS = 10;
const roundTenth = (value: number): number => Math.round(value * TENTHS) / TENTHS;
const roundKnown = (value: number | null): number | null => (value === null ? null : roundTenth(value));
const scaleKnown = (value: number | null, factor: number): number | null => (value === null ? null : value * factor);
const MACROS = ['protein', 'carbs', 'fat', 'fiber'] as const;

/**
 * Energy and macros for some amount of food — kcal as a whole number, grams to
 * one decimal.
 *
 * @remarks
 * - **Rounded on the way in**, so every stored value, total and scaled copy has
 *   the same precision and a day's sum never shows `0.30000000000000004`.
 * - **Every macro is optional** because a recipe can carry calories with no
 *   breakdown; `null` means "unknown", not zero. It survives scaling as `null`
 *   and a sum skips it.
 */
export class Nutrients {
  private constructor(readonly values: NutrientValues) {}

  static create(values: NutrientValues): Result<Nutrients, ValidationFailure> {
    const { calories } = values;
    if (!Number.isFinite(calories) || calories < 0 || calories > DiaryLimits.EntryCaloriesMax) {
      return fail(new ValidationFailure('errors.validation.nutrient_invalid', 'calories'));
    }
    for (const field of MACROS) {
      const grams = values[field];
      if (grams !== null && (!Number.isFinite(grams) || grams < 0 || grams > DiaryLimits.EntryMacroMax)) {
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

  /** Summed for a day's totals — an unknown macro adds nothing, so a total is always known. */
  plus(other: Nutrients): Nutrients {
    const add = (field: (typeof MACROS)[number]): number => (this.values[field] ?? 0) + (other.values[field] ?? 0);
    return Nutrients.rounded({
      calories: this.values.calories + other.values.calories,
      protein: add('protein'),
      carbs: add('carbs'),
      fat: add('fat'),
      fiber: add('fiber'),
    });
  }

  scale(factor: number): Nutrients {
    return Nutrients.rounded({
      calories: this.values.calories * factor,
      protein: scaleKnown(this.values.protein, factor),
      carbs: scaleKnown(this.values.carbs, factor),
      fat: scaleKnown(this.values.fat, factor),
      fiber: scaleKnown(this.values.fiber, factor),
    });
  }

  private static rounded(values: NutrientValues): Nutrients {
    return new Nutrients({
      calories: Math.round(values.calories),
      protein: roundKnown(values.protein),
      carbs: roundKnown(values.carbs),
      fat: roundKnown(values.fat),
      fiber: roundKnown(values.fiber),
    });
  }
}
