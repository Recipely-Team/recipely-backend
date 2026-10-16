import type { RecipeCreatedListenerInterface } from '@application/recipes/ports/recipe-created-listener-interface';

/** Several listeners behind the one slot `CreateRecipeUseCase` has; each runs on its own. */
export class RecipeCreatedListeners implements RecipeCreatedListenerInterface {
  constructor(private readonly listeners: readonly RecipeCreatedListenerInterface[]) {}

  created(recipeId: string): void {
    for (const listener of this.listeners) listener.created(recipeId);
  }
}
