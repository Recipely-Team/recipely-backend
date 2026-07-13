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
   * - stamps `deletedAt` and scrubs the PII (email → tombstone address, name →
   *   placeholder, bio / photo / password cleared);
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
}
