import type { InstagramConnection } from '@domain/instagram/instagram-connection';
import type { InstagramCommentData } from '@application/instagram/ports/instagram-graph-interface';
import type { InstagramEventInput } from '@application/instagram/ports/instagram-event-queue-interface';

const COMMENTS_FIELD = 'comments';

/** Whether a page came oldest first — the poller expects newest first. */
export function isAscending(items: readonly InstagramCommentData[]): boolean {
  const first = items[0]?.timestamp?.getTime();
  const last = items[items.length - 1]?.timestamp?.getTime();
  return first !== undefined && last !== undefined && first < last;
}

/** The creator's own comment, by id or username. */
export function isOwn(comment: InstagramCommentData, connection: InstagramConnection): boolean {
  return comment.fromId === connection.igUserId || comment.fromUsername?.toLowerCase() === connection.username.toLowerCase();
}

/** A polled comment as the webhook would have queued it, with the shared dedupe key. */
export function eventOf(comment: InstagramCommentData, mediaId: string, connection: InstagramConnection, now: Date): InstagramEventInput {
  return {
    igUserId: connection.igUserId,
    field: COMMENTS_FIELD,
    payload: { id: comment.id, text: comment.text, from: { id: comment.fromId, username: comment.fromUsername }, media: { id: mediaId } },
    eventTime: comment.timestamp ?? now,
    dedupeKey: `${COMMENTS_FIELD}:${comment.id}`,
  };
}
