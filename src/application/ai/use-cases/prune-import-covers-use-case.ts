import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IImportCoverReferenceReader } from '@application/ai/ports/i-import-cover-reference-reader';
import type { IImportCoverStore } from '@application/ai/ports/i-import-cover-store';
import type { ILogger } from '@application/ports/i-logger';

/**
 * How long an unclaimed cover is kept. An import returns a draft the user is
 * expected to review and save in the same sitting, but people put their phone
 * down — a day is generous enough that no real editing session loses its image,
 * and short enough that abandoned drafts don't accumulate on a 1 GB host.
 */
export const IMPORT_COVER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PruneImportCoversInput {
  /** URL prefix every stored cover shares, e.g. `https://api…/uploads/imports/`. */
  readonly prefix: string;
}

/**
 * Deletes import covers that no recipe claimed.
 *
 * Importing does not persist the recipe — the app gets a draft — so a cover is
 * written for every import, including the ones the user discards. Nothing else
 * ever deletes those files.
 */
export class PruneImportCoversUseCase {
  constructor(
    private readonly recipes: IImportCoverReferenceReader,
    private readonly coverStore: IImportCoverStore,
    private readonly logger: ILogger,
  ) {}

  async execute(input: PruneImportCoversInput): Promise<Result<number, Failure>> {
    const referenced = await this.recipes.listImagesUnder(input.prefix);

    // Bail rather than guess. An empty list from a FAILED query is
    // indistinguishable from "nothing is referenced", and acting on it would
    // delete the covers of every recipe in the database.
    if (!referenced.ok) {
      this.logger.warn(
        { failure: referenced.failure.messageKey },
        'import_cover_prune_skipped_lookup_failed',
      );
      return ok(0);
    }

    const keep = new Set(referenced.value);

    try {
      return ok(await this.coverStore.prune(IMPORT_COVER_MAX_AGE_MS, keep));
    } catch (err) {
      this.logger.warn({ err }, 'import_cover_prune_failed');
      return ok(0);
    }
  }
}
