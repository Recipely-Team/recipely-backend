import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface PasswordResetTokenData {
  readonly id: string;
  readonly userId: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

export interface IPasswordResetTokenRepository {
  create(userId: string, token: string, expiresAt: Date): Promise<Result<void, Failure>>;
  findByToken(token: string): Promise<Result<PasswordResetTokenData | null, Failure>>;
  markUsed(id: string): Promise<Result<void, Failure>>;
  deleteExpired(): Promise<Result<void, Failure>>;
}
