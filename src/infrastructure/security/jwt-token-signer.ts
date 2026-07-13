import jwt, { type SignOptions } from 'jsonwebtoken';
import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import type {
  ITokenSigner,
  TokenPayload,
} from '@application/auth/ports/i-token-signer';

export interface JwtConfig {
  readonly secret: string;
  readonly expiresIn: string;
}

export class JwtTokenSigner implements ITokenSigner {
  constructor(private readonly config: JwtConfig) {}

  sign(payload: TokenPayload): Promise<string> {
    const options = { expiresIn: this.config.expiresIn } as SignOptions;
    const token = jwt.sign({ sub: payload.sub, email: payload.email }, this.config.secret, options);
    return Promise.resolve(token);
  }

  verify(token: string): Promise<Result<TokenPayload, Failure>> {
    try {
      const decoded = jwt.verify(token, this.config.secret);
      if (typeof decoded !== 'object' || decoded === null) {
        return Promise.resolve(fail(new UnauthorizedFailure('errors.unauthorized.invalid_token', 'jwt.verify returned a non-object')));
      }
      const sub = (decoded as { sub?: unknown }).sub;
      const email = (decoded as { email?: unknown }).email;
      if (typeof sub !== 'string' || typeof email !== 'string') {
        return Promise.resolve(fail(new UnauthorizedFailure('errors.unauthorized.invalid_token', 'JWT payload missing sub/email')));
      }
      return Promise.resolve(ok({ sub, email }));
    } catch {
      return Promise.resolve(fail(new UnauthorizedFailure('errors.unauthorized.invalid_token', 'jwt.verify threw (malformed or expired token)')));
    }
  }
}
