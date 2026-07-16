-- Point a comment notification at the exact comment it was raised for, so the
-- app can deep-link to it instead of dumping the user at the top of the recipe.
-- Nullable and unset for every other notification type.
ALTER TABLE "notifications" ADD COLUMN "comment_id" UUID;

-- SetNull rather than Cascade: deleting a comment must not delete the history
-- of having been notified about it — the notification just loses its anchor and
-- falls back to linking at the recipe.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_comment_id_fkey"
  FOREIGN KEY ("comment_id") REFERENCES "comments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Supports the FK's referential-integrity checks on comment delete.
CREATE INDEX "notifications_comment_id_idx" ON "notifications"("comment_id");
