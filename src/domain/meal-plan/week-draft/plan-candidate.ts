import type { RecipeCategory } from '@domain/recipes/recipe-category';

/** A recipe the user saved, liked or wrote, as the week drafter weighs it. */
export interface PlanCandidate {
  readonly id: string;
  readonly category: RecipeCategory;
}
