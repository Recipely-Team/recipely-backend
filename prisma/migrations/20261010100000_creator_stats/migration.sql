-- Creator stats v1: whether a DM's recipe link was opened and the recipe saved,
-- and a daily follower snapshot per connected creator (Instagram keeps no
-- history of the follower count). Additive only.

-- AlterTable
ALTER TABLE "dm_sends" ADD COLUMN "opened_at" TIMESTAMP(3),
ADD COLUMN "saved_at" TIMESTAMP(3);

-- The stats read scans a creator's sends by creation time.
DROP INDEX IF EXISTS "dm_sends_user_id_idx";
CREATE INDEX "dm_sends_user_id_created_at_idx" ON "dm_sends"("user_id", "created_at");

-- CreateTable
CREATE TABLE "instagram_follower_snapshots" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "followers" INTEGER NOT NULL,
    "media_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_follower_snapshots_pkey" PRIMARY KEY ("user_id","day")
);

-- AddForeignKey
ALTER TABLE "instagram_follower_snapshots" ADD CONSTRAINT "instagram_follower_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
