/** The caps of the diary food search, named once for the use case, the client and the tests. */
export const DiarySearchLimits = {
  QueryMaxLength: 100,
  /** Shorter terms do not reach Open Food Facts — one letter matches half its database. */
  BrandedMinLength: 2,
  /** Most Open Food Facts matches appended to the curated ones (one upstream request). */
  BrandedMax: 40,
  /**
   * How long the search waits for Open Food Facts, all requests included. Past
   * it the answer goes out with the curated products and the recipes; a late
   * branded answer still lands in the client's cache for the next keystroke.
   */
  BrandedDeadlineMs: 1_200,
} as const;
