import type { LocalizedRecipe } from '@domain/recipes/localization/localized-recipe';
import type { RecipeProps } from '@domain/recipes/recipe-props';

/**
 * A recipe as one locale reads it: every localized field resolved to `locale`,
 * then English, then whichever locale the recipe was written in.
 *
 * Out of `Recipe` so the entity stays a size someone reads; `Recipe.localize`
 * is the only caller.
 */
export const localizeRecipe = (props: RecipeProps, locale: string): LocalizedRecipe => {
  return {
    name: props.name[locale] ?? props.name['en'] ?? Object.values(props.name)[0] ?? '',
    cuisine: props.cuisine,
    category: props.category,
    difficulty: props.difficulty,
    ingredients: props.ingredients[locale] ?? props.ingredients['en'] ?? Object.values(props.ingredients)[0] ?? [],
    instructions: props.instructions[locale] ?? props.instructions['en'] ?? Object.values(props.instructions)[0] ?? [],
    prepTimeMinutes: props.prepTimeMinutes,
    cookTimeMinutes: props.cookTimeMinutes,
    servings: props.servings,
    caloriesPerServing: props.caloriesPerServing,
    image: props.image,
    ...(props.imageFocus !== undefined ? { imageFocus: props.imageFocus } : {}),
    rating: props.rating,
    tags: props.tags[locale] ?? props.tags['en'] ?? Object.values(props.tags)[0] ?? [],
    mealType: props.mealType[locale] ?? props.mealType['en'] ?? Object.values(props.mealType)[0] ?? [],
    media: props.media,
    ownerId: props.ownerId,
    ...(props.nutrition !== undefined ? { nutrition: props.nutrition } : {}),
    ...(props.tips !== undefined ? { tips: props.tips[locale] ?? props.tips['en'] ?? Object.values(props.tips)[0] ?? [] } : {}),
    isPublished: props.isPublished,
    moderationStatus: props.moderationStatus,
    viewCount: props.viewCount,
    origin: props.origin,
    ...(props.sourceUrl !== undefined ? { sourceUrl: props.sourceUrl } : {}),
    ...(props.sourceHandle !== undefined ? { sourceHandle: props.sourceHandle } : {}),
    sourcePlatform: props.sourcePlatform ?? null,
    aiWritten: props.aiWritten ?? false,
    imageCredit: props.imageCredit ?? null,
    nutritionSource: props.nutritionSource ?? null,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
};
