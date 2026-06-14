import { RecipeCategory } from '@domain/recipes/recipe-category';
import type { TaxonomyMeta } from '@application/recipes/taxonomy/taxonomy-meta';

/**
 * Single source of truth for category display metadata (emoji + localized
 * names). Keyed by {@link RecipeCategory}; the iteration order for the API
 * comes from `RECIPE_CATEGORY_VALUES`, not from this record.
 */
export const CATEGORY_CATALOG: Record<RecipeCategory, TaxonomyMeta> = {
  [RecipeCategory.Breakfast]: { emoji: '🍳', en: 'Breakfast', tr: 'Kahvaltı' },
  [RecipeCategory.Brunch]: { emoji: '🥐', en: 'Brunch', tr: 'Branç' },
  [RecipeCategory.Lunch]: { emoji: '🥪', en: 'Lunch', tr: 'Öğle Yemeği' },
  [RecipeCategory.Dinner]: { emoji: '🍽️', en: 'Dinner', tr: 'Akşam Yemeği' },
  [RecipeCategory.Dessert]: { emoji: '🍰', en: 'Dessert', tr: 'Tatlı' },
  [RecipeCategory.Snack]: { emoji: '🍿', en: 'Snack', tr: 'Atıştırmalık' },
  [RecipeCategory.Drink]: { emoji: '🥤', en: 'Drink', tr: 'İçecek' },
  [RecipeCategory.Smoothie]: { emoji: '🧋', en: 'Smoothie', tr: 'Smoothie' },
  [RecipeCategory.Soup]: { emoji: '🍲', en: 'Soup', tr: 'Çorba' },
  [RecipeCategory.Stew]: { emoji: '🍲', en: 'Stew', tr: 'Güveç' },
  [RecipeCategory.Salad]: { emoji: '🥗', en: 'Salad', tr: 'Salata' },
  [RecipeCategory.Appetizer]: { emoji: '🧆', en: 'Appetizer', tr: 'Meze' },
  [RecipeCategory.SideDish]: { emoji: '🍚', en: 'Side Dish', tr: 'Yan Yemek' },
  [RecipeCategory.MainCourse]: { emoji: '🍛', en: 'Main Course', tr: 'Ana Yemek' },
  [RecipeCategory.Pasta]: { emoji: '🍝', en: 'Pasta', tr: 'Makarna' },
  [RecipeCategory.Pizza]: { emoji: '🍕', en: 'Pizza', tr: 'Pizza' },
  [RecipeCategory.Sandwich]: { emoji: '🥪', en: 'Sandwich', tr: 'Sandviç' },
  [RecipeCategory.Bread]: { emoji: '🍞', en: 'Bread', tr: 'Ekmek' },
  [RecipeCategory.Baking]: { emoji: '🧁', en: 'Baking', tr: 'Fırın' },
  [RecipeCategory.Sauce]: { emoji: '🥫', en: 'Sauce', tr: 'Sos' },
  [RecipeCategory.Grill]: { emoji: '🍖', en: 'Grill', tr: 'Izgara' },
  [RecipeCategory.Rice]: { emoji: '🍚', en: 'Rice', tr: 'Pilav' },
  [RecipeCategory.Noodle]: { emoji: '🍜', en: 'Noodle', tr: 'Erişte' },
  [RecipeCategory.Seafood]: { emoji: '🦐', en: 'Seafood', tr: 'Deniz Ürünleri' },
  [RecipeCategory.Casserole]: { emoji: '🍲', en: 'Casserole', tr: 'Fırın Yemeği' },
  [RecipeCategory.Curry]: { emoji: '🍛', en: 'Curry', tr: 'Köri' },
  [RecipeCategory.Dumpling]: { emoji: '🥟', en: 'Dumpling', tr: 'Mantı' },
  [RecipeCategory.Pie]: { emoji: '🥧', en: 'Pie', tr: 'Turta' },
  [RecipeCategory.Wrap]: { emoji: '🌯', en: 'Wrap', tr: 'Dürüm' },
  [RecipeCategory.Cake]: { emoji: '🎂', en: 'Cake', tr: 'Pasta' },
  [RecipeCategory.Cookie]: { emoji: '🍪', en: 'Cookie', tr: 'Kurabiye' },
  [RecipeCategory.Preserve]: { emoji: '🍯', en: 'Preserve', tr: 'Reçel' },
};
