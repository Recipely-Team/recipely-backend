/**
 * Picks which key in a pool a given user is served by — the same one every time.
 *
 * @remarks
 * - **Sticky, so a user has ONE key.** The requirement is that a user draws
 *   from at most one key: sharing a user's traffic across the whole pool means
 *   a single heavy user can trip every quota the deployment owns, and there is
 *   then nothing left for anyone.
 * - **Hashed rather than assigned from a table.** An assignment row would be
 *   exactly balanced, but it needs a migration, a write on first use, and
 *   coordination between the API and each worker — which is a shared store on
 *   the one path that has to keep working when everything else is down. FNV-1a
 *   over the user id spreads evenly enough that with N users and K keys each
 *   key carries about N/K of them, which is the shape that was asked for:
 *   48 users over 48 keys is one each, 96 is two each.
 * - **The pool size is the divisor, not a fixed 50.** Keys get added and
 *   revoked; a hard-coded count would silently send a share of users to a key
 *   that is no longer there.
 */
export function userKeyIndex(userId: string, poolSize: number): number {
  if (poolSize <= 0) return 0;

  // FNV-1a, 32-bit. Chosen for being short enough to read and having no
  // clustering on the id shapes this receives (uuids and cuids alike).
  let hash = 0x811c9dc5;
  for (let at = 0; at < userId.length; at += 1) {
    hash ^= userId.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % poolSize;
}
