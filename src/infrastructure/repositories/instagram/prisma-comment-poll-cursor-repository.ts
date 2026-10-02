import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type {
  CommentPollCursorInterface,
  CommentPollState,
  CommentPollTarget,
} from '@application/instagram/ports/comment-poll-cursor-interface';

/**
 * **`instagram_comment_cursors`** and the targets the poller reads.
 *
 * @remarks
 * - A target is a post with an enabled rule whose owner's connection is
 *   active and unexpired, and which is due (`next_poll_at` passed or unset) —
 *   one row per post, whatever its number of rules.
 * - `since` is the later of the post's cursor (the last comment queued,
 *   inclusive) and when its rules were (re-)enabled — so a rule switched back
 *   on after a week answers nothing from that week, and a first poll starts
 *   at the rule's own enabling.
 */
export class PrismaCommentPollCursorRepository implements CommentPollCursorInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async listDue(now: Date, limit: number): Promise<Result<CommentPollTarget[], Failure>> {
    try {
      const rows = await this.prisma.$queryRaw<CommentPollTarget[]>`
        SELECT r.user_id AS "userId", r.media_id AS "mediaId",
               GREATEST(k.last_seen_at, MIN(r.enabled_at)) AS since,
               k.resume_after AS "resumeAfter", k.resume_newest_at AS "resumeNewestAt",
               COALESCE(k.empty_polls, 0)::int AS "emptyPolls"
        FROM dm_rules r
        JOIN instagram_connections c
          ON c.user_id = r.user_id AND c.status = ${InstagramConnectionStatus.Active} AND c.token_expires_at > ${now}
        LEFT JOIN instagram_comment_cursors k ON k.media_id = r.media_id
        WHERE r.enabled AND (k.next_poll_at IS NULL OR k.next_poll_at <= ${now})
        GROUP BY r.user_id, r.media_id, k.last_seen_at, k.polled_at, k.resume_after, k.resume_newest_at, k.empty_polls
        ORDER BY k.polled_at ASC NULLS FIRST, r.media_id ASC
        LIMIT ${limit}`;
      return ok(rows);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async save(mediaId: string, igUserId: string, state: CommentPollState): Promise<Result<void, Failure>> {
    try {
      await this.prisma.instagramCommentCursor.upsert({
        where: { mediaId },
        create: { mediaId, igUserId, ...state },
        update: { igUserId, ...state },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async touch(mediaId: string, igUserId: string, since: Date, polledAt: Date): Promise<Result<void, Failure>> {
    try {
      await this.prisma.instagramCommentCursor.upsert({
        where: { mediaId },
        create: { mediaId, igUserId, lastSeenAt: since, polledAt },
        update: { polledAt },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
