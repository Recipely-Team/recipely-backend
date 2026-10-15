import type { RecipeProps } from '@domain/recipes/recipe-props';
import { RECIPE_LOCALES } from '@domain/recipes/localization/recipe-locales';
import type { TranslationGap } from '@domain/recipes/localization/translation-gap';

const hasName = (props: RecipeProps, locale: string): boolean => (props.name[locale] ?? '').trim().length > 0;

/**
 * The languages a recipe is not yet written in, and the one to translate from.
 *
 * @remarks
 * - **A language counts once it has a name.** The name is what every list
 *   shows; a locale with a name and no steps is a half-written row this never
 *   produces, because a translation is stored whole.
 * - **The source is the author's own words when they are English, otherwise
 *   the first language the recipe was written in** — translating a
 *   translation would compound its mistakes.
 */
export const translationGapOf = (props: RecipeProps): TranslationGap | null => {
  const written = Object.keys(props.name).filter((locale) => hasName(props, locale));
  const from = written.includes('en') ? 'en' : written[0];
  if (from === undefined) return null;
  const missing = RECIPE_LOCALES.filter((locale) => !hasName(props, locale));
  if (missing.length === 0) return null;
  return {
    from,
    missing,
    text: {
      name: props.name[from] ?? '',
      ingredients: props.ingredients[from] ?? Object.values(props.ingredients)[0] ?? [],
      instructions: props.instructions[from] ?? Object.values(props.instructions)[0] ?? [],
      tags: props.tags[from] ?? [],
      mealType: props.mealType[from] ?? [],
      tips: props.tips?.[from] ?? [],
    },
  };
};
