-- Add soft-delete column. NULL = live, non-NULL = soft-deleted.
ALTER TABLE "recipes" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Partial index for primary public listing
CREATE INDEX "recipes_deleted_at_null_is_published_created_at_idx"
  ON "recipes"("is_published", "created_at" DESC)
  WHERE "deleted_at" IS NULL;

-- Partial index for rating-sort listing
CREATE INDEX "recipes_deleted_at_null_is_published_rating_idx"
  ON "recipes"("is_published", "rating" DESC)
  WHERE "deleted_at" IS NULL;
