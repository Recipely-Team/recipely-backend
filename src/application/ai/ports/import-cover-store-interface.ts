/**
 * Stores the cover image lifted out of an imported Instagram video.
 *
 * An import returns a DRAFT recipe that is not persisted — the user may never
 * save it — so every import leaves a file behind that may never be claimed.
 * {@link prune} is what keeps that from growing without bound on a 1 GB host.
 */
export interface ImportCoverStoreInterface {
  /** Persists a cover frame and returns the public URL it is served from. */
  save(jpeg: Buffer): Promise<string>;

  /**
   * Deletes stored covers older than `maxAgeMs` whose FILENAME is absent from
   * `keep`, and returns how many files were removed.
   *
   * Both conditions matter. The age alone would delete the cover of a draft the
   * user is still editing; the reference check alone would never delete
   * anything until a draft was explicitly abandoned, which the app has no way
   * to signal.
   *
   * `keep` holds filenames, not URLs, so that a change to `BASE_URL` cannot
   * make a referenced cover look unreferenced and get it deleted.
   */
  prune(maxAgeMs: number, keep: ReadonlySet<string>): Promise<number>;
}
