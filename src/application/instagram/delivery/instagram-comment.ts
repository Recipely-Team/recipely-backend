/** A `comments` webhook value, read down to what the automations use. */
export interface InstagramComment {
  readonly commentId: string;
  readonly mediaId: string;
  readonly text: string;
  readonly fromId: string | null;
  readonly fromUsername: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** The comment in a queued event's payload, or `null` for one missing its id, post or text. */
export function commentOf(payload: unknown): InstagramComment | null {
  if (!isRecord(payload)) return null;
  const media = isRecord(payload.media) ? payload.media : {};
  const from = isRecord(payload.from) ? payload.from : {};
  const commentId = text(payload.id);
  const mediaId = text(media.id);
  const body = text(payload.text);
  if (commentId === null || mediaId === null || body === null) return null;
  return { commentId, mediaId, text: body, fromId: text(from.id), fromUsername: text(from.username) };
}
