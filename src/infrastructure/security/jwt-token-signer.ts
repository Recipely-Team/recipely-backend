import jwt, { type SignOptions } from 'jsonwebtoken';
import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import type {
  TokenSignerInterface,
  TokenPayload,
} from '@application/auth/ports/token-signer-interface';

export interface JwtConfig {
  readonly secret: string;
  readonly expiresIn: string;
}

export class JwtTokenSigner implements TokenSignerInterface {
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
        return Promise.resolve(fail(new UnauthorizedFailure('Invalid token')));
      }
      const claims = decoded as { sub?: unknown; email?: unknown; scope?: unknown };
      // A session token carries NO scope, and this is the check that makes that
      // absence mean something. Narrow tokens (the OS assistant's, signed with
      // the same secret) do carry one, and they are readable from a container
      // the phone's assistant can reach — so without this line a token meant to
      // buy one assistant answer would verify here and buy the whole account.
      // Refusing every scope rather than a known list keeps a scope added later
      // from defaulting into a session.
      if (claims.scope !== undefined) {
        return Promise.resolve(fail(new UnauthorizedFailure('Not a session token')));
      }
      if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
        return Promise.resolve(fail(new UnauthorizedFailure('Invalid token payload')));
      }
      return Promise.resolve(ok({ sub: claims.sub, email: claims.email }));
    } catch {
      return Promise.resolve(fail(new UnauthorizedFailure('Invalid or expired token')));
    }
  }
}
