import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { CommentPollCursorInterface, CommentPollTarget } from '@application/instagram/ports/comment-poll-cursor-interface';

/**
 * **`instagram_comment_cursors`** and the targets the poller reads.
 *
 * @remarks
 * - A target is a post with an enabled rule whose owner's connection is
 *   active and unexpired — one row per post, whatever its number of rules.
 * - `since` is just past the last comment queued (Instagram's timestamps are
 *   whole seconds; a second comment in that same second is missed — rare,
 *   and the webhook, once live, still delivers it), or on a first poll the
 *   time the post's oldest enabled rule was made, so no older comment is
 *   answered.
 */
export class PrismaCommentPollCursorRepository implements CommentPollCursorInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async listDue(now: Date, limit: number): Promise<Result<CommentPollTarget[], Failure>> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ userId: string; mediaId: string; since: Date }>>`
        SELECT r.user_id AS "userId", r.media_id AS "mediaId",
               COALESCE(k.last_seen_at + interval '1 millisecond', MIN(r.created_at)) AS since
        FROM dm_rules r
        JOIN instagram_connections c
          ON c.user_id = r.user_id AND c.status = ${InstagramConnectionStatus.Active} AND c.token_expires_at > ${now}
        LEFT JOIN instagram_comment_cursors k ON k.media_id = r.media_id
        WHERE r.enabled
        GROUP BY r.user_id, r.media_id, k.last_seen_at, k.polled_at
        ORDER BY k.polled_at ASC NULLS FIRST, r.media_id ASC
        LIMIT ${limit}`;
      return ok(rows);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async advance(mediaId: string, igUserId: string, lastSeenAt: Date, polledAt: Date): Promise<Result<void, Failure>> {
    try {
      await this.prisma.instagramCommentCursor.upsert({
        where: { mediaId },
        create: { mediaId, igUserId, lastSeenAt, polledAt },
        update: { igUserId, lastSeenAt, polledAt },
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
