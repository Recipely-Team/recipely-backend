import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface TokenPayload {
  readonly sub: string;   // user id
  readonly email: string;
}

export interface TokenSignerInterface {
  sign(payload: TokenPayload): Promise<string>;
  verify(token: string): Promise<Result<TokenPayload, Failure>>;
}
