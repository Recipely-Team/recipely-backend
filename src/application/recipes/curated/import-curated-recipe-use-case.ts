import { createHash, randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { ImageCredit } from '@domain/recipes/curated/image-credit';
import type { CuratedRecipeRepositoryInterface } from '@domain/recipes/curated/curated-recipe-repository-interface';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import type { RecipePhotoStoreInterface } from '@application/recipes/ports/recipe-photo-store-interface';
import { reviewCuratedRecipe } from '@application/recipes/curated/review-curated-recipe';
import { reviewCuratedPhoto } from '@application/recipes/curated/review-curated-photo';
import type { ImageDimensionsReaderInterface } from '@application/recipes/ports/image-dimensions-reader-interface';
import { CuratedImportStatus, type CuratedImportStatusType } from '@application/recipes/curated/curated-import-status';
import type { CuratedRecipeInput } from '@application/recipes/curated/curated-recipe-input';
import { curatedRecipeProps } from '@application/recipes/curated/curated-recipe-props';

export interface ImportCuratedRecipeInput {
  readonly ownerId: string;
  readonly recipe: CuratedRecipeInput;
  /** The photo file's bytes; the store re-encodes and keeps them. */
  readonly photo: Buffer;
}

export interface CuratedImportResult {
  readonly slug: string;
  readonly status: CuratedImportStatusType;
  readonly recipeId?: string;
  /** True when the source photo was unchanged, so no upload happened. */
  readonly photoReused?: boolean;
  /** Why it was skipped, one line per failed gate; empty otherwise. */
  readonly reasons: readonly string[];
}

/**
 * Publishes one curated recipe under the official account, or says why not.
 *
 * @remarks
 * - **Idempotent on (owner, slug).** A second run replaces the content of the
 *   row the first one made, keeping its id and everything readers added.
 * - **Gates before side effects.** The file-checkable quality gates, the
 *   photo's size and the content moderator run first; a recipe that fails any of them is skipped
 *   with every reason, and no photo is stored for it.
 * - **One stored file per cover.** The source photo's sha256 is kept on the
 *   row: an unchanged photo is not uploaded again, and a changed one replaces
 *   the old file, which is deleted once the row no longer points at it.
 * - **Moderation outranks the dataset.** A row that is not approved and
 *   published — rejected, pending or unpublished — is skipped, and `replace`
 *   never writes visibility, so a re-import cannot re-approve it.
 * - **A slug somebody took down stays down**: a soft-deleted row is skipped,
 *   not resurrected.
 */
export class ImportCuratedRecipeUseCase {
  constructor(
    private readonly recipes: CuratedRecipeRepositoryInterface,
    private readonly photos: RecipePhotoStoreInterface,
    private readonly moderator: ContentModeratorInterface,
    private readonly dimensions: ImageDimensionsReaderInterface,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = randomUUID,
  ) {}

  async execute(input: ImportCuratedRecipeInput): Promise<Result<CuratedImportResult, Failure>> {
    const { recipe, ownerId } = input;
    const skipped = (reasons: string[]) => ok({ slug: recipe.slug, status: CuratedImportStatus.Skipped, reasons });

    const reasons = [...reviewCuratedRecipe(recipe, this.moderator), ...(await reviewCuratedPhoto(input.photo, this.dimensions))];
    if (reasons.length > 0) return skipped(reasons);
    const credit = ImageCredit.create(recipe.image.credit);
    if (!credit.ok) return credit;

    const existing = await this.recipes.findBySlug(ownerId, recipe.slug);
    if (!existing.ok) return existing;
    const previous = existing.value;
    if (previous?.deleted === true) return skipped(['deleted: this slug was taken down; restore it or use a new slug']);
    if (previous !== null && (previous.moderationStatus !== ModerationStatus.Approved || !previous.isPublished)) {
      const state = `${previous.storedStatus}, ${previous.isPublished ? 'published' : 'unpublished'}`;
      return skipped([`moderation: taken down by moderation (${state}); a re-import does not re-publish it`]);
    }

    const hash = createHash('sha256').update(input.photo).digest('hex');
    const reused = previous !== null && previous.imageSourceHash === hash;
    const stored = reused ? { url: previous.image } : await this.storePhoto(input.photo);
    if ('reason' in stored) return skipped([stored.reason]);
    const image = stored.url;

    const id = previous?.id ?? this.newId();
    const entity = Recipe.create(curatedRecipeProps(recipe, { id, ownerId, image, imageCredit: credit.value, now: this.now() }));
    const saved = !entity.ok
      ? entity
      : previous === null ? await this.recipes.create(entity.value, hash) : await this.recipes.replace(entity.value, hash);
    if (!saved.ok) {
      // The row still points at the old cover, so the one just stored is the orphan.
      if (!reused) await this.photos.remove(image);
      return saved;
    }
    // Only now that the row points at the new cover is the old file unreferenced.
    if (!reused && previous !== null && previous.image !== image) await this.photos.remove(previous.image);

    const status = previous === null ? CuratedImportStatus.Created : CuratedImportStatus.Updated;
    return ok({ slug: recipe.slug, status, recipeId: id, photoReused: reused, reasons: [] });
  }

  /** The stored photo's URL, or why it could not be stored. Neither step's rejection escapes. */
  private async storePhoto(photo: Buffer): Promise<{ url: string } | { reason: string }> {
    let prepared: Buffer;
    try {
      prepared = await this.photos.prepare(photo);
    } catch {
      return { reason: 'photo: the image file could not be read as a picture' };
    }
    try {
      return { url: await this.photos.save(prepared) };
    } catch (err) {
      return { reason: `photo: could not be stored (${err instanceof Error ? err.message : String(err)})` };
    }
  }
}
