import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface PendingRegistrationData {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly createdAt: Date;
  readonly lastCodeSentAt: Date;
}

export interface UpsertPendingRegistrationInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
}

export interface IPendingRegistrationRepository {
  upsert(input: UpsertPendingRegistrationInput): Promise<Result<void, Failure>>;
  findByEmail(email: string): Promise<Result<PendingRegistrationData | null, Failure>>;
  incrementAttempts(id: string): Promise<Result<void, Failure>>;
  deleteByEmail(email: string): Promise<Result<void, Failure>>;
  deleteExpired(): Promise<Result<void, Failure>>;
}
