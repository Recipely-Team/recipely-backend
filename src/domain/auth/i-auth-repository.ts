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
  findRoleById(id: string): Promise<Result<string | null, Failure>>;
  /** Finds an existing user by email or creates a social-auth user (no password). */
  findOrCreateSocialUser(input: FindOrCreateSocialUserInput): Promise<Result<SocialUserResult, Failure>>;
}
