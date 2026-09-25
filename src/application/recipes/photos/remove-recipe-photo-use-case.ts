import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, NotFoundFailure, type Failure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';

export interface RemoveRecipePhotoInput {
  readonly recipeId: string;
  readonly mediaId: string;
  readonly requesterId: string;
}

/**
 * Lets the owner take a photo back off their own recipe.
 *
 * @remarks
 * - **The same ownership check as deleting the recipe**, because it is the same
 *   question: whose recipe is this. The media id alone is never enough — the
 *   repository deletes by recipe AND media id so an owner of one recipe cannot
 *   reach into another's gallery with a guessed id.
 * - **Removing the last photo is allowed.** A recipe may be published without
 *   one, so refusing to remove the only one would invent a rule the create
 *   screen does not have.
 * - **Removing the photo that is the cover moves the cover on.** A recipe made
 *   with photos has its cover set to the first one, so the two are one file.
 *   Deleting only the gallery row left the removed photo on every card and at
 *   the top of the detail screen; the next photo now takes its place (see
 *   `coverAfterMediaRemoved`), in the same write.
 * - **An id that is not in this recipe's gallery is `not_found`**, not a
 *   silent success — a stale screen deleting a photo that is already gone
 *   was told it had worked.
 * - **The file on disk is left alone.** Deleting it is a sweep's job, not a
 *   request's: the row is what the app reads, and a request that also has to
 *   succeed at unlinking a file has a second way to fail for no benefit the
 *   user can see.
 */
export class RemoveRecipePhotoUseCase {
  constructor(private readonly repo: RecipeRepositoryInterface) {}

  async execute(input: RemoveRecipePhotoInput): Promise<Result<void, Failure>> {
    const found = await this.repo.getById(input.recipeId, input.requesterId);
    if (!found.ok) return found;

    const recipe = found.value.recipe;
    if (recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }
    if (!recipe.hasMedia(input.mediaId)) {
      return { ok: false, failure: new NotFoundFailure('errors.not_found.photo') };
    }

    const removed = await this.repo.writeCover(input.recipeId, {
      image: recipe.coverWithoutMedia(input.mediaId),
      dropMediaIds: [input.mediaId],
    });
    if (!removed.ok) return removed;

    return ok(undefined);
  }
}
