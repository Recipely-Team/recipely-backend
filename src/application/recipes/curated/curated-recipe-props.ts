import { ModerationStatus } from '@domain/moderation/moderation-status';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';
import type { ImageCredit } from '@domain/recipes/curated/image-credit';
import type { RecipeProps } from '@domain/recipes/recipe-props';
import type { CuratedRecipeInput } from '@application/recipes/curated/curated-recipe-input';

/** What only the import knows: the row's id, its owner, the stored photo and the time. */
interface CuratedRecipeContext {
  readonly id: string;
  readonly ownerId: string;
  readonly image: string;
  readonly imageCredit: ImageCredit;
  readonly now: Date;
}

const LOCALES = ['tr', 'en'] as const;

/** "1500 ml" for a liquid that gives its volume, "200 g" otherwise. */
const amountOf = (ing: CuratedRecipeInput['ingredients'][number]): string =>
  ing.ml !== undefined ? `${ing.ml} ml` : `${ing.grams ?? 0} g`;

const byLocale = <T>(pick: (locale: (typeof LOCALES)[number]) => T): Record<string, T> =>
  Object.fromEntries(LOCALES.map((locale) => [locale, pick(locale)]));

/**
 * The `Recipe` a curated file describes: published, approved, `CURATED`, with
 * its credit and its nutrition source.
 *
 * Each ingredient line is its amount and its label ("200 g kırmızı mercimek",
 * or "1500 ml su" for a liquid that gives `ml`). The grams stay the basis of
 * the nutrition either way; `ml` is only how a cook measures a liquid.
 */
export const curatedRecipeProps = (input: CuratedRecipeInput, ctx: CuratedRecipeContext): RecipeProps => {
  const n = input.nutrition;
  return {
    id: ctx.id,
    name: byLocale((l) => input.name[l]),
    cuisine: input.cuisine,
    category: input.category,
    difficulty: input.difficulty,
    ingredients: byLocale((l) => input.ingredients.map((ing) => `${amountOf(ing)} ${ing.label[l]}`)),
    instructions: byLocale((l) => [...input.steps[l]]),
    prepTimeMinutes: input.times.prepMinutes,
    cookTimeMinutes: input.times.cookMinutes,
    servings: input.servings,
    caloriesPerServing: Math.round(n.perServing.kcal),
    nutrition: {
      protein: n.perServing.protein,
      carbs: n.perServing.carbs,
      fat: n.perServing.fat,
      fiber: n.perServing.fiber,
      ...(n.servingWeightGrams !== undefined ? { servingWeightGrams: n.servingWeightGrams } : {}),
    },
    image: ctx.image,
    rating: 0,
    tags: input.tags !== undefined ? byLocale((l) => [...(input.tags?.[l] ?? [])]) : {},
    mealType: input.mealType !== undefined ? byLocale((l) => [...(input.mealType?.[l] ?? [])]) : {},
    media: [],
    ownerId: ctx.ownerId,
    isPublished: true,
    moderationStatus: ModerationStatus.Approved,
    viewCount: 0,
    origin: RecipeOrigin.Curated,
    sourcePlatform: null,
    aiWritten: input.aiWritten,
    imageCredit: ctx.imageCredit,
    nutritionSource: n.source,
    slug: input.slug,
    importedImage: null,
    importedIngredientsHash: null,
    importedInstructionsHash: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
};
