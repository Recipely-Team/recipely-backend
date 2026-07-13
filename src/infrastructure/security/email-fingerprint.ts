import { createHash } from 'node:crypto';

/**
 * Deterministic SHA-256 fingerprint of an email address, used as the join key of
 * the account event log.
 *
 * Deletion scrubs the address from `users`, so the log cannot store it either
 * without undoing that. A fingerprint still answers the question the log exists
 * to answer — "has this address had an account deleted before?" — because the
 * same address always hashes to the same value. Normalised (trimmed, lowercased)
 * first so it matches the citext semantics of `users.email`.
 */
export function emailFingerprint(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
