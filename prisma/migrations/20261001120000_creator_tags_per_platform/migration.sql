-- Creator tags per platform: a user may hold an Instagram AND a TikTok tag, each
-- claimed, reviewed and withdrawn on its own. The single claim on `users` moves
-- to one `creator_tags` row per (user, platform).
--
-- The users.creator_* columns only ever existed on dev (never released), so
-- they are copied across and dropped in the same step.

-- CreateTable
CREATE TABLE "creator_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "creator_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_tags_user_id_platform_key" ON "creator_tags"("user_id", "platform");

-- CreateIndex
CREATE INDEX "creator_tags_status_idx" ON "creator_tags"("status");

-- AddForeignKey
ALTER TABLE "creator_tags" ADD CONSTRAINT "creator_tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One approved holder per platform + handle. Partial, so any number of pending
-- or rejected claims may name the same handle; Prisma's schema language cannot
-- express the WHERE clause, so this index lives only here. The approval use case
-- checks first; this closes the race between two concurrent approvals.
CREATE UNIQUE INDEX "creator_tags_approved_handle_key" ON "creator_tags"("platform", "handle") WHERE "status" = 'approved';

-- Copy every live account's claim. A deleted account's columns were already
-- cleared by deletion; the filter keeps a hand-edited tombstone out anyway.
INSERT INTO "creator_tags" ("user_id", "platform", "handle", "status", "requested_at", "reviewed_at")
SELECT "id", "creator_platform", "creator_handle", "creator_status", "creator_requested_at", "creator_reviewed_at"
FROM "users"
WHERE "creator_status" <> 'none'
  AND "creator_platform" IS NOT NULL
  AND "creator_handle" IS NOT NULL
  AND "creator_requested_at" IS NOT NULL
  AND "deleted_at" IS NULL;

-- DropIndex
DROP INDEX "users_creator_approved_handle_key";

-- DropIndex
DROP INDEX "users_creator_status_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "creator_status",
DROP COLUMN "creator_platform",
DROP COLUMN "creator_handle",
DROP COLUMN "creator_requested_at",
DROP COLUMN "creator_reviewed_at";
