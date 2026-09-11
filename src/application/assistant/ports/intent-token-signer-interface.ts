import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { TokenPayload } from '@application/auth/ports/token-signer-interface';

/**
 * Signs and verifies the narrow, long-lived token the OS assistant carries.
 *
 * @remarks
 * - **A separate port, not a second method on `TokenSignerInterface`.** The two
 *   tokens answer different questions, and anything holding the session signer
 *   must not be able to mint one of these by reaching for the wrong method.
 * - **The payload is the same shape on purpose.** A headless answer needs the
 *   same `sub` the session path needs, so the middleware that accepts either
 *   credential can hand the controller one `req.user` and the controller never
 *   learns which door the request came through.
 */
export interface IntentTokenSignerInterface {
  sign(payload: TokenPayload): Promise<string>;
  verify(token: string): Promise<Result<TokenPayload, Failure>>;
  /** Seconds until a freshly signed token expires, so a caller can say when to refresh. */
  readonly lifetimeSeconds: number;
}
