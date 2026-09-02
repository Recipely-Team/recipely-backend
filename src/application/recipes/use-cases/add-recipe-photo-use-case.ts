import { ok, type Result } from '@core/result/result';
import {
  ForbiddenFailure,
  ServiceUnavailableFailure,
  UnprocessableFailure,
  type Failure,
} from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeMedia } from '@domain/recipes/recipe-media';
import type { ImageModeratorInterface } from '@application/ai/ports/image-moderator-interface';
import type { RecipePhotoStoreInterface } from '@application/recipes/ports/recipe-photo-store-interface';

export interface AddRecipePhotoInput {
  readonly recipeId: string;
  readonly requesterId: string;
  /** The uploaded bytes, before any resizing. */
  readonly upload: Buffer;
}

/**
 * Lets the owner add a photo to a recipe that is already published.
 *
 * @remarks
 * - **The order is prepare, judge, store — and it is the whole design.** The
 *   moderator sees the exact bytes that would be served, and it sees them while
 *   they exist only in memory. Storing first and checking afterwards would put
 *   a rejected photo at a public URL, briefly, and a URL that existed is a URL
 *   somebody may hold.
 * - **A moderator that could not answer REFUSES the upload.** "We could not
 *   check it" and "there is nothing wrong with it" are different sentences, and
 *   only one of them may publish a photo. The cost of being wrong the other way
 *   is one retry; the cost of this way is whatever the photo turns out to be.
 *   The one exception is a deployment with no AI keys at all, where the
 *   moderator is explicitly disabled and approves — an operator's decision,
 *   not an outage.
 * - **Ownership, not moderation, is checked first.** A stranger's upload should
 *   be refused because it is not their recipe, without spending a vision call
 *   to discover that the picture was fine.
 * - **Editing a recipe is still gone.** This adds a photo and nothing else: no
 *   text, no ingredients, no re-publishing. The narrow door is the point.
 */
export class AddRecipePhotoUseCase {
  constructor(
    private readonly repo: RecipeRepositoryInterface,
    private readonly photos: RecipePhotoStoreInterface,
    private readonly moderator: ImageModeratorInterface,
  ) {}

  async execute(input: AddRecipePhotoInput): Promise<Result<RecipeMedia, Failure>> {
    const found = await this.repo.getById(input.recipeId, input.requesterId);
    if (!found.ok) return found;

    if (found.value.recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const prepared = await this.photos.prepare(input.upload);

    const verdict = await this.moderator.moderate({
      image: prepared,
      mimeType: this.photos.mimeType,
    });
    if (!verdict.ok) {
      return { ok: false, failure: new ServiceUnavailableFailure('errors.recipe.photo_unchecked') };
    }
    if (verdict.value.status === 'rejected') {
      return {
        ok: false,
        failure: new UnprocessableFailure('errors.recipe.photo_rejected', 'photo'),
      };
    }

    const url = await this.photos.save(prepared);
    const added = await this.repo.addMedia(input.recipeId, { type: 'image', url });
    if (!added.ok) return added;

    return ok(added.value);
  }
}
