import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/**
 * Answers the one question the cover prune needs: which stored covers are
 * still spoken for by a recipe?
 *
 * Deliberately its own port rather than another method on `IRecipeRepository`.
 * That interface is implemented by a fake in every recipe use-case test, so a
 * method there costs churn in a dozen files to express a dependency this narrow
 * — and the prune has no business being handed `create`, `delete` and the rest.
 */
export interface IImportCoverReferenceReader {
  /**
   * Every recipe `image` CONTAINING `marker`, across ALL recipes — published,
   * draft, and soft-deleted alike. A soft-deleted recipe can be restored, so
   * its cover is not garbage.
   *
   * Matches on a path fragment rather than a full URL prefix on purpose. Covers
   * are stored as absolute URLs built from `BASE_URL` at import time, and this
   * deployment has already moved `BASE_URL` once (a bare IP to
   * `https://api.recipely.net`). Anchoring on today's base URL would make every
   * cover written under the old one invisible here — and the prune would then
   * delete files that live recipes still point at.
   */
  listImagesContaining(marker: string): Promise<Result<string[], Failure>>;
}
