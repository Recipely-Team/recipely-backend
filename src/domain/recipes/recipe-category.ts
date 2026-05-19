export const RecipeCategory = {
  Breakfast: 'BREAKFAST',
  Lunch: 'LUNCH',
  Dinner: 'DINNER',
  Dessert: 'DESSERT',
  Snack: 'SNACK',
  Drink: 'DRINK',
  Soup: 'SOUP',
  Salad: 'SALAD',
  Appetizer: 'APPETIZER',
  SideDish: 'SIDE_DISH',
  MainCourse: 'MAIN_COURSE',
} as const;

export type RecipeCategory = (typeof RecipeCategory)[keyof typeof RecipeCategory];

export const isRecipeCategory = (v: unknown): v is RecipeCategory =>
  v === RecipeCategory.Breakfast ||
  v === RecipeCategory.Lunch ||
  v === RecipeCategory.Dinner ||
  v === RecipeCategory.Dessert ||
  v === RecipeCategory.Snack ||
  v === RecipeCategory.Drink ||
  v === RecipeCategory.Soup ||
  v === RecipeCategory.Salad ||
  v === RecipeCategory.Appetizer ||
  v === RecipeCategory.SideDish ||
  v === RecipeCategory.MainCourse;

export const RECIPE_CATEGORY_VALUES: readonly RecipeCategory[] = [
  RecipeCategory.Breakfast,
  RecipeCategory.Lunch,
  RecipeCategory.Dinner,
  RecipeCategory.Dessert,
  RecipeCategory.Snack,
  RecipeCategory.Drink,
  RecipeCategory.Soup,
  RecipeCategory.Salad,
  RecipeCategory.Appetizer,
  RecipeCategory.SideDish,
  RecipeCategory.MainCourse,
];
