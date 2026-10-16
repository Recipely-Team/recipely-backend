import { MealSlot, type MealSlotType } from '@domain/diary/meal-slot';
import { RecipeCategory } from '@domain/recipes/recipe-category';

const BREAKFAST: readonly RecipeCategory[] = [
  RecipeCategory.Breakfast, RecipeCategory.Brunch, RecipeCategory.Bread, RecipeCategory.Baking, RecipeCategory.Smoothie,
];
const SNACK: readonly RecipeCategory[] = [
  RecipeCategory.Snack, RecipeCategory.Dessert, RecipeCategory.Cake, RecipeCategory.Cookie, RecipeCategory.Smoothie,
  RecipeCategory.Drink, RecipeCategory.Appetizer,
];
/** Never a meal on their own: a sauce, a jam, a side dish waits for something to go with it. */
const NEVER_A_MEAL: readonly RecipeCategory[] = [RecipeCategory.Sauce, RecipeCategory.Preserve, RecipeCategory.SideDish];

/**
 * How well a recipe's category suits a meal: 2 is made for it, 1 will do,
 * 0 does not belong there.
 *
 * @remarks
 * Lunch and dinner take any main dish, and a dish named for the other one
 * (a `LUNCH` recipe at dinner) still does. Breakfast and snacks are narrower:
 * nobody wants a casserole at seven, or soup as a snack.
 */
export const slotFit = (meal: MealSlotType, category: RecipeCategory): number => {
  if (NEVER_A_MEAL.includes(category)) return 0;
  if (meal === MealSlot.Breakfast) return BREAKFAST.includes(category) ? 2 : 0;
  if (meal === MealSlot.Snack) return SNACK.includes(category) ? 2 : 0;
  if (BREAKFAST.includes(category) || SNACK.includes(category)) return 0;
  if (meal === MealSlot.Lunch) return category === RecipeCategory.Lunch || category === RecipeCategory.Salad || category === RecipeCategory.Sandwich || category === RecipeCategory.Wrap || category === RecipeCategory.Soup ? 2 : 1;
  return category === RecipeCategory.Dinner || category === RecipeCategory.Lunch ? 1 : 2;
};
