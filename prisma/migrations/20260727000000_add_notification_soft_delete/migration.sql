-- Soft-delete flag for notifications, mirroring Comment's soft-delete pattern.
-- Set when the notification's source comment is soft-deleted so the feed can
-- hide it without losing the row.
ALTER TABLE "notifications" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- No new index: the existing "notifications_commentId_idx" (on commentId
-- alone) already supports `updateMany({ where: { commentId } })`, and
-- listForUser/countUnread filter on recipientId first, which is already the
-- lead column of "notifications_recipientId_read_createdAt_idx".
