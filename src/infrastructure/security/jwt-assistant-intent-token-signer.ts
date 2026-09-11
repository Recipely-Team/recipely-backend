import jwt, { type SignOptions } from 'jsonwebtoken';
import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import { AssistantTokenScope } from '@domain/assistant/assistant-token-scope';
import type { TokenPayload } from '@application/auth/ports/token-signer-interface';
import type { IntentTokenSignerInterface } from '@application/assistant/ports/intent-token-signer-interface';

export interface AssistantIntentJwtConfig {
  readonly secret: string;
  readonly lifetimeSeconds: number;
}

/**
 * Mints the token an OS assistant carries, and refuses anything else.
 *
 * @remarks
 * - **The same secret, a different claim.** A second secret would have to be
 *   generated, stored, rotated and kept in step with a deploy, and it buys
 *   nothing here: what has to be impossible is a token from one door opening
 *   the other, and a claim both sides check achieves exactly that. The session
 *   signer refuses any token carrying `scope`; this one requires the one scope
 *   it knows. Neither will accept the other's token, and a token that somehow
 *   carries a scope this code does not know is refused rather than tolerated.
 * - **Long-lived on purpose, and that is why it is narrow.** The phone may not
 *   open the app for weeks while still asking Siri questions, so a session's
 *   expiry would make the feature fail silently and unpredictably. The answer to
 *   a long life is a small blast radius, not a shorter one — this token reaches
 *   the assistant's typed turn and nothing else.
 * - **`lifetimeSeconds`, not a string.** `jsonwebtoken` takes `'30d'`; the
 *   caller has to tell a client when to refresh, and deriving a date back out of
 *   a duration string is how the two drift apart.
 */
export class JwtAssistantIntentTokenSigner implements IntentTokenSignerInterface {
  constructor(private readonly config: AssistantIntentJwtConfig) {}

  get lifetimeSeconds(): number {
    return this.config.lifetimeSeconds;
  }

  sign(payload: TokenPayload): Promise<string> {
    const options = { expiresIn: this.config.lifetimeSeconds } as SignOptions;
    const token = jwt.sign(
      { sub: payload.sub, email: payload.email, scope: AssistantTokenScope.Intent },
      this.config.secret,
      options,
    );
    return Promise.resolve(token);
  }

  verify(token: string): Promise<Result<TokenPayload, Failure>> {
    try {
      const decoded = jwt.verify(token, this.config.secret);
      if (typeof decoded !== 'object' || decoded === null) {
        return Promise.resolve(fail(new UnauthorizedFailure('Invalid token')));
      }
      const claims = decoded as { sub?: unknown; email?: unknown; scope?: unknown };
      // The scope is checked before the identity: a session token verifies
      // against this secret too, and accepting one here would quietly let the
      // app's own JWT be used on a path that was built to need less.
      if (claims.scope !== AssistantTokenScope.Intent) {
        return Promise.resolve(fail(new UnauthorizedFailure('Not an assistant intent token')));
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
