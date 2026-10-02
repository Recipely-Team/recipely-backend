import { fail, ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { InstagramPendingLinkRepositoryInterface } from '@domain/instagram/instagram-pending-link-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { ConnectStateSignerInterface } from '@application/instagram/ports/connect-state-signer-interface';
import type { OneTimeCodeInterface } from '@application/instagram/ports/one-time-code-interface';
import { instagramNotConfigured } from '@application/instagram/instagram-not-configured';
import {
  InstagramCallbackStatus,
  InstagramConnectError,
  type InstagramConnectErrorType,
} from '@application/instagram/connect/instagram-connect-outcome';

const SECOND_MS = 1000;
/** How long the app has to finalise after the browser returns. */
const PENDING_LIFETIME_MS = 10 * 60 * 1000;

export interface ReceiveInstagramAuthorizationInput {
  readonly code?: string;
  readonly state?: string;
  /** Set by Instagram when the user declined. */
  readonly error?: string;
}

/** Where to send the browser, and what to tell the app there. */
export type ReceiveInstagramAuthorizationResult =
  | { readonly returnTo: string; readonly status: typeof InstagramCallbackStatus.Authorized; readonly code: string }
  | { readonly returnTo: string; readonly status: typeof InstagramCallbackStatus.Error; readonly reason: InstagramConnectErrorType };

/**
 * **`GET /auth/instagram/callback`** — Instagram's redirect after consent.
 * It links NOTHING: it parks the authorization and hands the app a one-time
 * code to finalise with.
 *
 * @remarks
 * - Why not link here: the browser carries no session, and the signed `state`
 *   only says which Recipely user STARTED the connect. Linking on the strength
 *   of that let an attacker start a connect on their own account, send the
 *   consent link to a creator, and receive the creator's Instagram token and a
 *   verified creator tag when the creator approved. Now the account sits in a
 *   pending link only `FinalizeInstagramConnectUseCase` can claim, and only for
 *   a session of the user who started it — the creator's app, holding the
 *   creator's session, cannot finalise the attacker's link, and the attacker
 *   never sees the code.
 * - The code is random, single-use, valid 10 minutes and stored only hashed;
 *   the token is stored encrypted by the repository.
 * - A missing or bad `state` is a Failure — there is no trustworthy return
 *   link to report to.
 */
export class ReceiveInstagramAuthorizationUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly state: ConnectStateSignerInterface,
    private readonly pending: InstagramPendingLinkRepositoryInterface,
    private readonly codes: OneTimeCodeInterface,
    private readonly logger: LoggerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ReceiveInstagramAuthorizationInput): Promise<Result<ReceiveInstagramAuthorizationResult, Failure>> {
    if (this.graph === null) return fail(instagramNotConfigured());
    const started = await this.state.verify(input.state ?? '');
    if (!started.ok) return started;
    const { userId, returnTo } = started.value;
    const error = (reason: InstagramConnectErrorType): Result<ReceiveInstagramAuthorizationResult, Failure> =>
      ok({ returnTo, status: InstagramCallbackStatus.Error, reason });

    if (input.error !== undefined || input.code === undefined) return error(InstagramConnectError.Denied);
    const short = await this.graph.exchangeCode(input.code);
    if (!short.ok) return this.failed(error, short.failure, 'exchange');
    const long = await this.graph.longLived(short.value.accessToken);
    if (!long.ok) return this.failed(error, long.failure, 'long_lived');
    const profile = await this.graph.profile(long.value.accessToken);
    if (!profile.ok) return this.failed(error, profile.failure, 'profile');

    const now = this.now();
    const code = this.codes.mint();
    const parked = await this.pending.create(this.codes.hash(code), {
      userId,
      igUserId: profile.value.igUserId,
      appScopedId: profile.value.appScopedId,
      username: profile.value.username,
      accessToken: long.value.accessToken,
      tokenExpiresAt: new Date(now.getTime() + long.value.expiresInSeconds * SECOND_MS),
      expiresAt: new Date(now.getTime() + PENDING_LIFETIME_MS),
    });
    if (!parked.ok) return parked;
    return ok({ returnTo, status: InstagramCallbackStatus.Authorized, code });
  }

  private failed(
    error: (reason: InstagramConnectErrorType) => Result<ReceiveInstagramAuthorizationResult, Failure>,
    failure: Failure,
    step: string,
  ): Result<ReceiveInstagramAuthorizationResult, Failure> {
    this.logger.warn({ step, messageKey: failure.messageKey }, 'instagram_connect_failed');
    return error(InstagramConnectError.Failed);
  }
}
