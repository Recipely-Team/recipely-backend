import { UnauthorizedFailure } from '@core/failure';
import type { AccountStatus } from '@domain/auth/auth-repository-interface';
import { canSignIn } from '@domain/auth/user-role';

/**
 * Why an account may not hold a session, or `null` when it may.
 *
 * @remarks
 * - **The one rule every sign-in path asks**: password login, social sign-in
 *   (Google, Apple — every Firebase provider) and each authenticated request,
 *   which is what keeps an already-issued token alive. A check copied into
 *   each path was how suspension shipped reaching only some of them.
 * - Missing or deleted, then suspended, then a role that never signs in
 *   (the official account). The official case reads as `account_cannot_sign_in`.
 */
export const accountAccessRefusal = (status: AccountStatus | null): UnauthorizedFailure | null => {
  if (status === null || status.deletedAt !== null) return new UnauthorizedFailure('errors.unauthorized.account_deleted');
  if (status.suspendedAt !== null) return new UnauthorizedFailure('errors.unauthorized.account_suspended');
  if (!canSignIn(status.role)) return new UnauthorizedFailure('errors.unauthorized.account_cannot_sign_in');
  return null;
};
