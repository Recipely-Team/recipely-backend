import { ImageCredit } from '@domain/recipes/curated/image-credit';
import { kcalBandOf } from '@domain/recipes/curated/kcal-band';
import { CuratedGate, type CuratedGateHit } from '@application/recipes/curated/curated-gate';
import { mentionsIngredient } from '@application/recipes/curated/ingredient-mention';
import type { CuratedRecipeInput } from '@application/recipes/curated/curated-recipe-input';

/** How far the stated kcal may sit from the macro estimate, as a fraction of it. */
const ENERGY_TOLERANCE = 0.12;
const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9, fiber: 2 } as const;
const LOCALES = ['tr', 'en'] as const;

const ingredientSourced = (input: CuratedRecipeInput): CuratedGateHit[] =>
  input.ingredients.flatMap((ing, i) => {
    const hasId = typeof ing.fdcId === 'number' && Number.isInteger(ing.fdcId) && ing.fdcId > 0;
    const hasGrams = typeof ing.grams === 'number' && ing.grams > 0;
    if (hasId && hasGrams) return [];
    const missing = [hasId ? null : 'fdcId', hasGrams ? null : 'grams'].filter((m) => m !== null).join(' and ');
    return [{ gate: CuratedGate.IngredientSourced, detail: `ingredient ${i + 1} (${ing.label.en}) has no ${missing}` }];
  });

const energy = (input: CuratedRecipeInput): CuratedGateHit[] => {
  const n = input.nutrition.perServing;
  // FDC carbohydrate is "by difference" and already includes fiber, so fiber
  // is taken out of the 4 kcal/g carbs and counted once, at 2 kcal/g.
  const estimate =
    KCAL_PER_GRAM.protein * n.protein +
    KCAL_PER_GRAM.carbs * (n.carbs - n.fiber) +
    KCAL_PER_GRAM.fat * n.fat +
    KCAL_PER_GRAM.fiber * n.fiber;
  const off = Math.abs(n.kcal - estimate);
  if (estimate === 0 ? n.kcal === 0 : off <= ENERGY_TOLERANCE * estimate) return [];
  const pct = estimate === 0 ? '∞' : `${Math.round((off / estimate) * 100)}%`;
  return [{ gate: CuratedGate.Energy, detail: `kcal ${n.kcal} vs ${Math.round(estimate)} from the macros (${pct} off, limit 12%)` }];
};

const kcalBand = (input: CuratedRecipeInput): CuratedGateHit[] => {
  const { min, max } = kcalBandOf(input.category);
  const kcal = input.nutrition.perServing.kcal;
  if (input.reviewed || (kcal >= min && kcal <= max)) return [];
  return [{ gate: CuratedGate.KcalBand, detail: `${kcal} kcal is outside ${input.category}'s ${min}–${max}; set "reviewed": true once checked` }];
};

const ingredientInSteps = (input: CuratedRecipeInput): CuratedGateHit[] =>
  LOCALES.flatMap((locale) => {
    const steps = input.steps[locale].join(' ');
    return input.ingredients
      .filter((ing) => !mentionsIngredient(steps, ing.label[locale], locale))
      .map((ing) => ({ gate: CuratedGate.IngredientInSteps, detail: `"${ing.label[locale]}" is not in the ${locale} steps` }));
  });

const totalTime = (input: CuratedRecipeInput): CuratedGateHit[] => {
  const { prepMinutes, cookMinutes, totalMinutes } = input.times;
  if (prepMinutes + cookMinutes === totalMinutes) return [];
  return [{ gate: CuratedGate.TotalTime, detail: `total ${totalMinutes} min ≠ prep ${prepMinutes} + cook ${cookMinutes}` }];
};

const imageCredit = (input: CuratedRecipeInput): CuratedGateHit[] => {
  const credit = ImageCredit.create(input.image.credit);
  if (credit.ok) return [];
  return [{ gate: CuratedGate.ImageCredit, detail: `${credit.failure.field ?? 'imageCredit'} is invalid (license "${input.image.credit.license}")` }];
};

/**
 * Every file-checkable quality gate a curated recipe fails; empty means it may
 * be published. All gates run, so one report lists everything to fix.
 */
export const curatedGateFailures = (input: CuratedRecipeInput): CuratedGateHit[] => [
  ...ingredientSourced(input),
  ...energy(input),
  ...kcalBand(input),
  ...ingredientInSteps(input),
  ...totalTime(input),
  ...imageCredit(input),
];
