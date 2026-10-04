import { RecipeCategory } from '@domain/recipes/recipe-category';

/** The plausible per-serving kcal range of one kind of dish, inclusive. */
export interface KcalBand {
  readonly min: number;
  readonly max: number;
}

const SOUP: KcalBand = { min: 60, max: 350 };
const MAIN: KcalBand = { min: 200, max: 900 };
const SIDE: KcalBand = { min: 80, max: 500 };
const DESSERT: KcalBand = { min: 150, max: 700 };
const BREAKFAST: KcalBand = { min: 100, max: 700 };
const DRINK: KcalBand = { min: 0, max: 350 };

/**
 * Which band each category is held to. A category not listed is a main.
 *
 * @remarks
 * - **Six bands, many categories.** The quality gates name soup, main, side,
 *   dessert, breakfast and drink; every stored category folds into one of
 *   them, by what a serving of it is on a plate.
 * - **A value outside the band is not wrong, it is unchecked** — the import
 *   holds it back until a person has looked (`reviewed: true` in the file).
 */
const BAND_BY_CATEGORY: Partial<Record<RecipeCategory, KcalBand>> = {
  [RecipeCategory.Soup]: SOUP,
  [RecipeCategory.Breakfast]: BREAKFAST,
  [RecipeCategory.Brunch]: BREAKFAST,
  [RecipeCategory.Drink]: DRINK,
  [RecipeCategory.Smoothie]: DRINK,
  [RecipeCategory.Dessert]: DESSERT,
  [RecipeCategory.Cake]: DESSERT,
  [RecipeCategory.Cookie]: DESSERT,
  [RecipeCategory.Baking]: DESSERT,
  [RecipeCategory.SideDish]: SIDE,
  [RecipeCategory.Salad]: SIDE,
  [RecipeCategory.Appetizer]: SIDE,
  [RecipeCategory.Snack]: SIDE,
  [RecipeCategory.Bread]: SIDE,
  [RecipeCategory.Rice]: SIDE,
  [RecipeCategory.Sauce]: SIDE,
  [RecipeCategory.Preserve]: SIDE,
};

export const kcalBandOf = (category: RecipeCategory): KcalBand => BAND_BY_CATEGORY[category] ?? MAIN;
