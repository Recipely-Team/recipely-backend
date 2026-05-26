import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface IFcmTokenRepository {
  register(userId: string, token: string, platform: string): Promise<Result<void, Failure>>;
  getTokensForUser(userId: string): Promise<Result<string[], Failure>>;
  deleteToken(token: string): Promise<Result<void, Failure>>;
}
