import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';

export interface RemoveRecipeCoverInput {
  readonly recipeId: string;
  readonly requesterId: string;
}

/** What the recipe shows once its cover is gone. */
export interface RemoveRecipeCoverResult {
  /** The new cover: the next gallery photo, or `''` when there is none. */
  readonly image: string;
  /** Gallery rows removed because they were the same photo as the cover. */
  readonly removedMediaIds: readonly string[];
}

/**
 * Lets the owner remove a recipe's cover photo.
 *
 * @remarks
 * - **The cover could not be removed at all before.** Gallery photos had a
 *   DELETE and the cover had none, so an import's cover — the stored copy of
 *   the site's own photo — stayed on the recipe for good. The copyright gate
 *   asks the owner to remove exactly that photo, so this is its way out.
 * - **The photo goes everywhere it appears, and the next one is promoted.**
 *   See `coverRemoved`: a cover is usually also the first gallery photo, and
 *   a recipe that still has photos should not show an empty card.
 * - **Owner only**, same question as removing any other photo. A missing,
 *   deleted or someone else's private recipe is `not_found` from the read.
 */
export class RemoveRecipeCoverUseCase {
  constructor(private readonly repo: RecipeRepositoryInterface) {}

  async execute(input: RemoveRecipeCoverInput): Promise<Result<RemoveRecipeCoverResult, Failure>> {
    const found = await this.repo.getById(input.recipeId, input.requesterId);
    if (!found.ok) return found;

    const recipe = found.value.recipe;
    if (recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const change = recipe.withoutCover();
    const written = await this.repo.writeCover(input.recipeId, change);
    if (!written.ok) return written;

    return ok({ image: change.image, removedMediaIds: change.dropMediaIds });
  }
}
