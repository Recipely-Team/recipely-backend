import { MealMatchKind } from '@domain/diary/meal-match-kind';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import type { FoodProductData } from '@application/foods/food-product-data';
import type { DetectedMealItem } from '@application/diary/ports/meal-parser-interface';
import type { MealParseItemDto } from '@application/diary/dtos/meal-parse-item.dto';
import type { NutrientsPerPortionDto } from '@application/diary/dtos/nutrients-per-portion.dto';

const PER = 100;
const FALLBACK_LOCALE = 'en';

/**
 * Turns one detected item into a candidate, with our catalogue's nutrients
 * whenever the catalogue knows the food.
 *
 * @remarks
 * - **First hit of the catalogue search** for the model's search term — the
 *   search already ranks name-prefix matches and common foods first.
 * - **Estimated only when unmatched** (or the search failed): the model's
 *   own numbers come back flagged `estimated: true` and `match.kind: none`.
 * - **A nutrient the catalogue leaves null** (unknown) takes the model's
 *   estimate rather than a zero that would read as "none".
 */
export async function matchMealItem(
  catalog: FoodCatalogInterface,
  item: DetectedMealItem,
  locale: string,
): Promise<MealParseItemDto> {
  const found = await catalog.search({ term: item.searchTerm, page: 1, pageSize: 1 });
  const product = found.ok ? found.value.items[0] : undefined;
  if (product === undefined || product.foodVariantId === null) {
    return {
      label: item.label,
      grams: item.grams,
      match: { kind: MealMatchKind.None },
      nutrientsPerPortion: item.estimate,
      estimated: true,
      confidence: item.confidence,
    };
  }
  return {
    label: item.label,
    grams: item.grams,
    match: { kind: MealMatchKind.Food, id: product.foodVariantId, name: productName(product, locale) },
    nutrientsPerPortion: portionOf(product, item),
    estimated: false,
    confidence: item.confidence,
  };
}

function portionOf(product: FoodProductData, item: DetectedMealItem): NutrientsPerPortionDto {
  const scale = item.grams / PER;
  const per100 = product.per100;
  const part = (value: number | null, estimate: number): number => (value === null ? estimate : round1(value * scale));
  return {
    kcal: Math.round(per100.calories * scale),
    protein: part(per100.protein, item.estimate.protein),
    carbs: part(per100.carbs, item.estimate.carbs),
    fat: part(per100.fat, item.estimate.fat),
    fiber: part(per100.fiber, item.estimate.fiber),
  };
}

function productName(product: FoodProductData, locale: string): string {
  const name = product.names[locale] ?? product.names[FALLBACK_LOCALE] ?? Object.values(product.names)[0] ?? '';
  const variant = product.variantNames?.[locale] ?? product.variantNames?.[FALLBACK_LOCALE];
  return variant !== undefined && variant !== '' ? `${name}, ${variant}` : name;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
