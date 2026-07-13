/**
 * Tombstone values written over a deleted account's PII.
 *
 * The email is rewritten (rather than nulled — the column is NOT NULL and unique)
 * to an address that can never collide with a real one, which is what releases the
 * user's actual address for a fresh signup.
 */
export const DeletedAccount = {
  DISPLAY_NAME: 'Deleted user',
  EMAIL_DOMAIN: 'deleted.recipely.invalid',

  /** Unique, non-routable stand-in for the address the deleted account used to own. */
  tombstoneEmail(userId: string): string {
    return `deleted+${userId}@${DeletedAccount.EMAIL_DOMAIN}`;
  },
} as const;
