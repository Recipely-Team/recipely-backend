-- Comment polling fallback for the Instagram automations: how far each post's
-- comments have been read. Additive only.

-- CreateTable
CREATE TABLE "instagram_comment_cursors" (
    "media_id" TEXT NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "polled_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_comment_cursors_pkey" PRIMARY KEY ("media_id")
);

-- CreateIndex
CREATE INDEX "instagram_comment_cursors_polled_at_idx" ON "instagram_comment_cursors"("polled_at");
