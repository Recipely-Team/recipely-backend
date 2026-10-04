import jwt, { type SignOptions } from 'jsonwebtoken';
import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import type { ConnectStateData, ConnectStateSignerInterface } from '@application/instagram/ports/connect-state-signer-interface';

const SCOPE = 'instagram_connect';
/** Long enough to log in to Instagram, short enough that a leaked link is soon dead. */
const LIFETIME_SECONDS = 15 * 60;

/**
 * **The OAuth `state` for Business Login for Instagram**: a short-lived JWT
 * signed with the server secret, carrying the user and the return link.
 *
 * @remarks
 * - It carries `scope`, which the session signer refuses, so a state can
 *   never be replayed as a login; this signer refuses anything without its
 *   own scope.
 * - A fresh `jti` per state keeps two connects from minting the same value.
 */
export class JwtConnectStateSigner implements ConnectStateSignerInterface {
  constructor(private readonly secret: string) {}

  sign(data: ConnectStateData): Promise<string> {
    const options = { expiresIn: LIFETIME_SECONDS, jwtid: cryptoId() } as SignOptions;
    return Promise.resolve(jwt.sign({ sub: data.userId, returnTo: data.returnTo, scope: SCOPE }, this.secret, options));
  }

  verify(state: string): Promise<Result<ConnectStateData, Failure>> {
    try {
      const claims = jwt.verify(state, this.secret) as { sub?: unknown; returnTo?: unknown; scope?: unknown };
      if (claims.scope !== SCOPE || typeof claims.sub !== 'string' || typeof claims.returnTo !== 'string') {
        return Promise.resolve(fail(invalid()));
      }
      return Promise.resolve(ok({ userId: claims.sub, returnTo: claims.returnTo }));
    } catch {
      return Promise.resolve(fail(invalid()));
    }
  }
}

const invalid = (): Failure => new UnauthorizedFailure('errors.instagram.state_invalid');
const cryptoId = (): string => globalThis.crypto.randomUUID();
