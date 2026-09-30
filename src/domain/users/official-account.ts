/**
 * Recipely's own publishing account — the owner of every curated recipe.
 *
 * @remarks
 * - **One row, `role = 'official'`**, no password: it cannot sign in, and its
 *   recipes arrive only through the curated import.
 * - The email is configurable (`CURATED_OWNER_EMAIL`) because it is the key the
 *   import finds the account by; the default is a recipely.net address nobody
 *   signs up with.
 */
export const OfficialAccount = {
  DisplayName: 'Recipely Mutfağı',
  DefaultEmail: 'mutfak@recipely.net',
} as const;
