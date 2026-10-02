-- Comment polling fallback for the Instagram automations: how far each post's
-- comments have been read. Additive only.

-- CreateTable
CREATE TABLE "instagram_comment_cursors" (
    "media_id" TEXT NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "polled_at" TIMESTAMP(3) NOT NULL,
    "resume_after" TEXT,
    "resume_newest_at" TIMESTAMP(3),
    "empty_polls" INTEGER NOT NULL DEFAULT 0,
    "next_poll_at" TIMESTAMP(3),

    CONSTRAINT "instagram_comment_cursors_pkey" PRIMARY KEY ("media_id")
);

-- CreateIndex
CREATE INDEX "instagram_comment_cursors_polled_at_idx" ON "instagram_comment_cursors"("polled_at");

-- One queued event per comment: the webhook and the poller may both see it,
-- and the poller re-reads its cursor's own second on purpose.
-- AlterTable
ALTER TABLE "instagram_events" ADD COLUMN "dedupe_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "instagram_events_dedupe_key_key" ON "instagram_events"("dedupe_key");

-- When a rule was last switched on; existing rules count from their creation.
-- AlterTable
ALTER TABLE "dm_rules" ADD COLUMN "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "dm_rules" SET "enabled_at" = "created_at";
