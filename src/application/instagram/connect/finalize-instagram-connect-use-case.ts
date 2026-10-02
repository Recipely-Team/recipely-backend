import { randomUUID } from 'crypto';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, type Failure } from '@core/failure';
import { CreatorHandle } from '@domain/users/creator-handle';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';
import { InstagramConnection } from '@domain/instagram/instagram-connection';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { InstagramPendingLinkRepositoryInterface } from '@domain/instagram/instagram-pending-link-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { InstagramGraphInterface } from '@application/instagram/ports/instagram-graph-interface';
import type { OneTimeCodeInterface } from '@application/instagram/ports/one-time-code-interface';
import type { InstagramConnectionDto } from '@application/instagram/dtos/instagram-connection.dto';
import { InstagramMapper } from '@application/instagram/mappers/instagram.mapper';
import { instagramNotConfigured } from '@application/instagram/instagram-not-configured';
import { CreatorTagOutcome, type CreatorTagOutcomeType } from '@application/instagram/connect/instagram-connect-outcome';

export interface FinalizeInstagramConnectInput {
  /** The signed-in user — must be the one who started the connect. */
  readonly userId: string;
  /** The one-time code from the callback's return link. */
  readonly code: string;
}

export interface FinalizeInstagramConnectResult {
  readonly connection: InstagramConnectionDto;
  readonly creatorTag: CreatorTagOutcomeType;
}

/**
 * **`POST /me/instagram/finalize`** — the app, with its session, claims the
 * authorization the callback parked, and only then is the account linked.
 *
 * @remarks
 * - The code is taken once. A code that is unknown, expired, already used, or
 *   was parked for a DIFFERENT user answers the same
 *   `errors.instagram.link_invalid` (404) — never "this belongs to someone
 *   else" — and is spent either way. That mismatch is exactly the hijack this
 *   step exists to stop (see `ReceiveInstagramAuthorizationUseCase`).
 * - An Instagram account linked to another user is refused
 *   (`errors.conflict.instagram_account_linked`), not moved.
 * - Signing in to Instagram proves the account is the user's, so — after
 *   finalising, never before — their Instagram creator tag becomes the real
 *   username, approved, unless another user already holds that handle approved.
 * - Comment webhooks are switched on for the account; a failure there is
 *   logged, not fatal.
 */
export class FinalizeInstagramConnectUseCase {
  constructor(
    private readonly graph: InstagramGraphInterface | null,
    private readonly pending: InstagramPendingLinkRepositoryInterface,
    private readonly codes: OneTimeCodeInterface,
    private readonly connections: InstagramConnectionRepositoryInterface,
    private readonly creatorTags: CreatorTagRepositoryInterface,
    private readonly logger: LoggerInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: FinalizeInstagramConnectInput): Promise<Result<FinalizeInstagramConnectResult, Failure>> {
    if (this.graph === null) return fail(instagramNotConfigured());
    const now = this.now();
    const taken = await this.pending.take(this.codes.hash(input.code));
    if (!taken.ok) return taken;
    const link = taken.value;
    if (link === null || link.userId !== input.userId || link.expiresAt <= now) {
      return fail(new NotFoundFailure('errors.instagram.link_invalid'));
    }

    const linked = await this.connections.findByIgUserId(link.igUserId);
    if (!linked.ok) return linked;
    if (linked.value !== null && linked.value.userId !== input.userId) {
      return fail(new ConflictFailure('errors.conflict.instagram_account_linked'));
    }
    const mine = await this.connections.findByUserId(input.userId);
    if (!mine.ok) return mine;

    const connection = InstagramConnection.restore({
      id: mine.value?.id ?? randomUUID(),
      userId: input.userId,
      igUserId: link.igUserId,
      appScopedId: link.appScopedId,
      username: link.username,
      accessToken: link.accessToken,
      tokenExpiresAt: link.tokenExpiresAt,
      status: InstagramConnectionStatus.Active,
      connectedAt: now,
      refreshedAt: now,
    });
    const saved = await this.connections.save(connection);
    if (!saved.ok) return saved;

    const subscribed = await this.graph.subscribeWebhooks(link.accessToken);
    if (!subscribed.ok) this.logger.warn({ userId: input.userId, messageKey: subscribed.failure.messageKey }, 'instagram_webhook_subscribe_failed');

    const creatorTag = await this.verifyCreatorTag(input.userId, link.username, now);
    if (!creatorTag.ok) return creatorTag;
    return ok({ connection: InstagramMapper.connection(connection, true), creatorTag: creatorTag.value });
  }

  private async verifyCreatorTag(userId: string, username: string, now: Date): Promise<Result<CreatorTagOutcomeType, Failure>> {
    const handle = CreatorHandle.create(CreatorPlatform.Instagram, username);
    if (!handle.ok) return ok(CreatorTagOutcome.Invalid);
    const held = await this.creatorTags.isHandleApprovedForAnotherUser(handle.value, userId);
    if (!held.ok) return held;
    if (held.value) return ok(CreatorTagOutcome.Taken);
    const claims = await this.creatorTags.findByUserId(userId);
    if (!claims.ok) return claims;
    const current = claims.value.find((tag) => tag.platform === CreatorPlatform.Instagram);
    if (current?.isApproved === true && current.account.equals(handle.value)) return ok(CreatorTagOutcome.Approved);
    const saved = await this.creatorTags.save(userId, CreatorTag.verified(handle.value, now));
    if (!saved.ok) return saved.failure.code === 'conflict' ? ok(CreatorTagOutcome.Taken) : saved;
    return ok(CreatorTagOutcome.Approved);
  }
}
