import { ModerationStatus } from '@domain/moderation/moderation-status';
/** The slice of a joined comment row needed to decide whether a reader can see it. */
export interface CommentVisibilityRow {
  readonly deletedAt: Date | null;
  readonly moderationStatus: string;
}

/**
 * Resolves the comment a notification may advertise as its deep-link anchor,
 * or `null` when the reader would never see that comment.
 *
 * Mirrors the visibility rule the recipe's comment list applies
 * (`PrismaCommentRepository.listByRecipe`: `deletedAt: null` +
 * `moderationStatus: ModerationStatus.Approved`). Both filters are load-bearing:
 *
 * - Comments are SOFT-deleted, so the `comment_id` FK's `ON DELETE SET NULL`
 *   never fires for them — a deleted comment keeps a live-looking id.
 * - An admin can flip an approved comment to rejected after the notification
 *   was raised, which removes it from the list retroactively.
 *
 * Handing either id to the app would deep-link it to a comment that is never
 * rendered: it would scroll nowhere and highlight nothing. Returning null
 * degrades the notification to a plain recipe link, which is always valid.
 */
export const visibleCommentId = (
  commentId: string | null,
  comment: CommentVisibilityRow | null | undefined,
): string | null => {
  if (commentId === null || comment == null) return null;
  if (comment.deletedAt !== null) return null;
  if (comment.moderationStatus !== ModerationStatus.Approved) return null;
  return commentId;
};
