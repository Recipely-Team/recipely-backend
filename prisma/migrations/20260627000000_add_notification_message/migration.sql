-- Carry free-text content on a notification (e.g. the comment body) so the
-- in-app feed can show what was actually said, not just who acted.
ALTER TABLE "notifications" ADD COLUMN "message" TEXT;
