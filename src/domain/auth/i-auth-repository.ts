import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Email } from '@domain/common/email';
import type { User } from '@domain/auth/user';

export interface UserCredentials {
  readonly user: User;
  readonly passwordHash: string;
  readonly role: string;
}

export interface CreateUserInput {
  readonly email: Email;
  readonly passwordHash: string;
  readonly displayName: string;
}

export interface FindOrCreateSocialUserInput {
  readonly email: Email;
  readonly displayName: string;
  readonly photoUrl: string | null;
}

export interface SocialUserResult {
  readonly user: User;
  readonly role: string;
}

export interface AccountStatus {
  readonly deletedAt: Date | null;
  readonly suspendedAt: Date | null;
}

export interface IAuthRepository {
  findCredentialsByEmail(email: Email): Promise<Result<UserCredentials | null, Failure>>;
  existsByEmail(email: Email): Promise<Result<boolean, Failure>>;
  createUser(input: CreateUserInput): Promise<Result<User, Failure>>;
  findById(id: string): Promise<Result<User | null, Failure>>;
  findByEmail(email: string): Promise<Result<User | null, Failure>>;
  findRoleById(id: string): Promise<Result<string | null, Failure>>;
  /** Finds an existing user by email or creates a social-auth user (no password). */
  findOrCreateSocialUser(input: FindOrCreateSocialUserInput): Promise<Result<SocialUserResult, Failure>>;
  updateAvatar(userId: string, photoUrl: string): Promise<Result<User, Failure>>;
  updateProfile(userId: string, data: { displayName?: string; bio?: string }): Promise<Result<User, Failure>>;
  updatePassword(userId: string, passwordHash: string): Promise<Result<void, Failure>>;
  /**
   * Deletes the account: the user is tombstoned rather than dropped, so the
   * deletion stays auditable and their content is retained-but-hidden instead of
   * cascade-erased. Atomically, in one transaction:
   *
   * - stamps `deletedAt` and scrubs the PII: on the user row (email → tombstone
   *   address, name → placeholder, bio / photo / password cleared) and the one PII
   *   field that lives outside it, `Feedback.contactEmail`. Free-text the user
   *   authored (feedback bodies, AI prompts, drafts) is retained under the
   *   tombstone — it is content, not identity, and it is unreachable once the
   *   account can no longer authenticate;
   * - soft-deletes owned recipes and comments (and rebalances the affected
   *   recipes' comment counts);
   * - purges credentials and relationship rows (tokens, favorites, likes,
   *   follows, received notifications) so no session survives and no other
   *   user's counters keep counting a deleted account;
   * - records a DELETED entry in the account event log.
   *
   * Freeing the real address is what lets the same person sign up again — that
   * signup is a NEW account with a NEW id (see `createUser`), never a revival of
   * the tombstone. Returns a NotFoundFailure when no *active* user matches the id.
   */
  deleteAccount(userId: string): Promise<Result<void, Failure>>;
  /**
   * Whether the id belongs to a live (non-tombstoned) account. The auth layer
   * calls this on every authenticated request: JWTs are stateless, so without it
   * a token minted before deletion would keep working until it expired.
   */
  isActive(userId: string): Promise<Result<boolean, Failure>>;
  /**
   * Deletion and suspension flags for the id, or null if no such user exists at
   * all. Backs `EnsureAccountActiveUseCase`, which runs on every authenticated
   * request for the same stateless-JWT reason `isActive` does — this returns
   * both flags in the one query so distinguishing "deleted" from "suspended"
   * costs nothing extra per request.
   */
  getAccountStatus(userId: string): Promise<Result<AccountStatus | null, Failure>>;
  /**
   * Suspends a live account: reversible, unlike deletion — the row, its
   * content, and its PII are untouched. `reason` is admin-facing context
   * surfaced on the User show page. NotFoundFailure if the account is already
   * deleted or does not exist.
   *
   * `actorId` is the admin performing it, recorded in the account event log. It
   * is optional because the port must stay callable from outside the panel, but
   * every caller that KNOWS who acted is expected to pass it — an unattributed
   * moderation action is not an audit trail.
   */
  suspendUser(userId: string, reason: string | null, actorId?: string): Promise<Result<void, Failure>>;
  /**
   * Lifts a suspension. NotFoundFailure if the account is deleted or does not
   * exist.
   *
   * Logged as its own event rather than by clearing the suspension one: the
   * ban happened, and a record that can be erased by lifting it is not a record.
   */
  unsuspendUser(userId: string, actorId?: string): Promise<Result<void, Failure>>;
}
