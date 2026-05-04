-- Materialized total time so the list endpoint can filter `maxTime` natively
-- and use an index instead of computing per row. Backfill from existing rows.
ALTER TABLE "recipes" ADD COLUMN "total_time_minutes" INTEGER NOT NULL DEFAULT 0;
UPDATE "recipes" SET "total_time_minutes" = "prep_time_minutes" + "cook_time_minutes";

CREATE INDEX "recipes_total_time_minutes_idx" ON "recipes"("total_time_minutes");

-- Index rating descending so the popular/rating sort stays cheap as the table grows.
CREATE INDEX "recipes_rating_desc_idx" ON "recipes"("is_published", "rating" DESC);
