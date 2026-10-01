/** The caps of the diary food search, named once for the use case, the client and the tests. */
export const DiarySearchLimits = {
  QueryMaxLength: 100,
  /** Shorter terms do not reach Open Food Facts — one letter matches half its database. */
  BrandedMinLength: 2,
  /** Most Open Food Facts matches appended to the curated ones (one upstream request). */
  BrandedMax: 40,
} as const;
