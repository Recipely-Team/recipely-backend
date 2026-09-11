import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeSocialData } from '@domain/recipes/query/recipe-social-data';

/** One recipe paired with the counters for the viewer who asked. */
export interface RecipeWithSocial {
  readonly recipe: Recipe;
  readonly social: RecipeSocialData;
}
