-- Creator tag: a user's claimed Instagram or TikTok account, approved by an admin.
--
-- Additive only. Existing rows get creator_status 'none' and null claim columns.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "creator_status" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "creator_platform" TEXT,
ADD COLUMN     "creator_handle" TEXT,
ADD COLUMN     "creator_requested_at" TIMESTAMP(3),
ADD COLUMN     "creator_reviewed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_creator_status_idx" ON "users"("creator_status");

-- One approved holder per platform + handle. Partial, so any number of pending
-- or rejected claims may name the same handle; Prisma's schema language cannot
-- express the WHERE clause, so this index lives only here. The approval use case
-- checks first; this closes the race between two concurrent approvals.
CREATE UNIQUE INDEX "users_creator_approved_handle_key" ON "users"("creator_platform", "creator_handle") WHERE "creator_status" = 'approved';
