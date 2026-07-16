import { visibleCommentId } from '@infrastructure/repositories/notifications/visible-comment-id';

const COMMENT_ID = 'comment-uuid';

describe('visibleCommentId', () => {
  it('returns the id for a live, approved comment', () => {
    expect(visibleCommentId(COMMENT_ID, { deletedAt: null, moderationStatus: 'approved' })).toBe(
      COMMENT_ID,
    );
  });

  // Comments are soft-deleted, so the FK's ON DELETE SET NULL never fires for
  // them: the column still holds a live-looking id that the reader can't see.
  it('hides a soft-deleted comment', () => {
    expect(
      visibleCommentId(COMMENT_ID, {
        deletedAt: new Date('2026-07-16T00:00:00Z'),
        moderationStatus: 'approved',
      }),
    ).toBeNull();
  });

  // Notifications are only raised for approved comments, but an admin can flip
  // one to rejected afterwards, which pulls it out of the recipe's list.
  it.each(['pending', 'rejected'])('hides a %s comment', (moderationStatus) => {
    expect(visibleCommentId(COMMENT_ID, { deletedAt: null, moderationStatus })).toBeNull();
  });

  it('returns null when the notification has no comment (like, follow, ai)', () => {
    expect(visibleCommentId(null, null)).toBeNull();
  });

  // A hard-deleted comment nulls the FK but the join yields nothing; guard both
  // halves independently so neither alone can leak an unrenderable anchor.
  it('returns null when the id survives but the joined comment does not', () => {
    expect(visibleCommentId(COMMENT_ID, null)).toBeNull();
    expect(visibleCommentId(COMMENT_ID, undefined)).toBeNull();
  });
});
