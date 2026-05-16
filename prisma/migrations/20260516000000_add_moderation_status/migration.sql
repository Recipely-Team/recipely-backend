-- Add moderation_status column with a default of 'approved' so existing rows
-- are treated as already-approved content.
ALTER TABLE "recipes" ADD COLUMN "moderation_status" TEXT NOT NULL DEFAULT 'approved';

-- Index for owner-scoped moderation queries (e.g. list pending/rejected per user).
CREATE INDEX "recipes_owner_id_moderation_status_idx" ON "recipes"("owner_id", "moderation_status");

-- One-time fix: publish all previously-approved recipes that were saved
-- as drafts by the old AI generator (isPublished=false, moderation_status='approved').
UPDATE "recipes" SET "is_published" = true
WHERE "moderation_status" = 'approved' AND "is_published" = false;
