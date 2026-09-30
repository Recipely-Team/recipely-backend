/**
 * The roles a row in `users` can carry.
 *
 * `role` is a plain string column with a `"user"` default, so a value this
 * build has never heard of is possible — and reads as *not* an admin, which is
 * the safe direction for a check that decides whether limits apply.
 */
export const UserRole = {
  Admin: 'admin',
  User: 'user',
  /**
   * Recipely's own publishing account ("Recipely Mutfağı"). It has no
   * password and cannot sign in; its recipes arrive through the curated
   * import. Not an admin: it lifts no limits.
   */
  Official: 'official',
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

/**
 * Whether a role read from the database lifts the usual limits.
 *
 * Read from the row rather than from the JWT on purpose: the token is
 * stateless and long-lived, so a role granted today would not reach a user
 * still holding yesterday's token until they signed in again.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === UserRole.Admin;
}
