import { randomUUID } from 'crypto';
import { fail, ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { CreatorHandle } from '@domain/users/creator-handle';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';
import { InstagramConnection } from '@domain/instagram/instagram-connection';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { ConnectStateSignerInterface } from '@application/instagram/ports/connect-state-signer-interface';
import { instagramNotConfigured } from '@application/instagram/instagram-not-configured';
import {
  CreatorTagOutcome,
  InstagramConnectError,
  type CreatorTagOutcomeType,
  type InstagramConnectErrorType,
} from '@application/instagram/connect/instagram-connect-outcome';

const SECOND_MS = 1000;

export interface CompleteInstagramConnectInput {
  readonly code?: string;
  readonly state?: string;
  /** Set by Instagram when the user declined. */
  readonly error?: string;
}

/** Where to send the browser, and what to tell the app there. */
export type CompleteInstagramConnectResult =
  | { readonly returnTo: string; readonly status: 'connected'; readonly username: string; readonly creatorTag: CreatorTagOutcomeType }
  | { readonly returnTo: string; readonly status: 'error'; readonly reason: InstagramConnectErrorType };

/**
 * **`GET /auth/instagram/callback`** — finishes Business Login for Instagram.
 *
 * @remarks
 * - The signed `state` is the only proof of who started the connect (the
 *   browser carries no session); a missing or bad one is a Failure — there is
 *   no trustworthy return link to report to.
 * - Code → short-lived token → long-lived token (~60 days) → the account's id
 *   and username, stored with the token (encrypted by the repository). An
 *   account already linked to another user is refused, not moved.
 * - Signing in to Instagram proves the account is the user's, so their
 *   Instagram creator tag becomes the real username, approved — unless another
 *   user already holds that handle approved (`taken`; an admin settles it).
 * - Comment webhooks are switched on for the account; a failure there is
 *   logged, not fatal (the next connect retries it).
 */
export class CompleteInstagramConnectUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly state: ConnectStateSignerInterface,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly creatorTags: CreatorTagRepositoryInterface,
    private readonly logger: LoggerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: CompleteInstagramConnectInput): Promise<Result<CompleteInstagramConnectResult, Failure>> {
    if (this.graph === null) return fail(instagramNotConfigured());
    const started = await this.state.verify(input.state ?? '');
    if (!started.ok) return started;
    const { userId, returnTo } = started.value;
    const error = (reason: InstagramConnectErrorType) => ok({ returnTo, status: 'error' as const, reason });

    if (input.error !== undefined || input.code === undefined) return error(InstagramConnectError.Denied);
    const short = await this.graph.exchangeCode(input.code);
    if (!short.ok) return this.failed(error, short.failure, 'exchange');
    const long = await this.graph.longLived(short.value.accessToken);
    if (!long.ok) return this.failed(error, long.failure, 'long_lived');
    const profile = await this.graph.profile(long.value.accessToken);
    if (!profile.ok) return this.failed(error, profile.failure, 'profile');

    const linked = await this.connections.findByIgUserId(profile.value.igUserId);
    if (!linked.ok) return linked;
    if (linked.value !== null && linked.value.userId !== userId) return error(InstagramConnectError.AccountLinked);
    const mine = await this.connections.findByUserId(userId);
    if (!mine.ok) return mine;

    const now = this.now();
    const saved = await this.connections.save(
      InstagramConnection.restore({
        id: mine.value?.id ?? randomUUID(),
        userId,
        igUserId: profile.value.igUserId,
        username: profile.value.username,
        accessToken: long.value.accessToken,
        tokenExpiresAt: new Date(now.getTime() + long.value.expiresInSeconds * SECOND_MS),
        status: InstagramConnectionStatus.Active,
        connectedAt: now,
        refreshedAt: now,
      }),
    );
    if (!saved.ok) return saved.failure.code === 'conflict' ? error(InstagramConnectError.AccountLinked) : saved;

    const subscribed = await this.graph.subscribeWebhooks(long.value.accessToken);
    if (!subscribed.ok) this.logger.warn({ userId, messageKey: subscribed.failure.messageKey }, 'instagram_webhook_subscribe_failed');

    const creatorTag = await this.verifyCreatorTag(userId, profile.value.username, now);
    if (!creatorTag.ok) return creatorTag;
    return ok({ returnTo, status: 'connected', username: profile.value.username, creatorTag: creatorTag.value });
  }

  private async verifyCreatorTag(userId: string, username: string, now: Date): Promise<Result<CreatorTagOutcomeType, Failure>> {
    const handle = CreatorHandle.create(CreatorPlatform.Instagram, username);
    if (!handle.ok) return ok(CreatorTagOutcome.Invalid);
    const taken = await this.creatorTags.isHandleApprovedForAnotherUser(handle.value, userId);
    if (!taken.ok) return taken;
    if (taken.value) return ok(CreatorTagOutcome.Taken);
    const claims = await this.creatorTags.findByUserId(userId);
    if (!claims.ok) return claims;
    const current = claims.value.find((tag) => tag.platform === CreatorPlatform.Instagram);
    if (current?.isApproved === true && current.account.equals(handle.value)) return ok(CreatorTagOutcome.Approved);
    const saved = await this.creatorTags.save(userId, CreatorTag.verified(handle.value, now));
    if (!saved.ok) return saved.failure.code === 'conflict' ? ok(CreatorTagOutcome.Taken) : saved;
    return ok(CreatorTagOutcome.Approved);
  }

  private failed(
    error: (reason: InstagramConnectErrorType) => Result<CompleteInstagramConnectResult, Failure>,
    failure: Failure,
    step: string,
  ): Result<CompleteInstagramConnectResult, Failure> {
    this.logger.warn({ step, messageKey: failure.messageKey }, 'instagram_connect_failed');
    return error(InstagramConnectError.Failed);
  }
}
