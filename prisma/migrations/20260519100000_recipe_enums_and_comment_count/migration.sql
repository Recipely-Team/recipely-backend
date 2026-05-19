-- CreateEnum
CREATE TYPE "RecipeCategory" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'DESSERT', 'SNACK', 'DRINK', 'SOUP', 'SALAD', 'APPETIZER', 'SIDE_DISH', 'MAIN_COURSE');

-- CreateEnum
CREATE TYPE "CuisineKey" AS ENUM ('TURKISH', 'ITALIAN', 'MEXICAN', 'CHINESE', 'JAPANESE', 'INDIAN', 'FRENCH', 'GREEK', 'AMERICAN', 'MEDITERRANEAN', 'THAI', 'SPANISH', 'KOREAN', 'MIDDLE_EASTERN', 'OTHER');

-- Drop old JSON cuisine column and replace with enum column
ALTER TABLE "recipes" DROP COLUMN "cuisine";
ALTER TABLE "recipes" ADD COLUMN "cuisine" "CuisineKey" NOT NULL DEFAULT 'OTHER';

-- Add category column with default
ALTER TABLE "recipes" ADD COLUMN "category" "RecipeCategory" NOT NULL DEFAULT 'MAIN_COURSE';

-- Add comment_count column with default 0
ALTER TABLE "recipes" ADD COLUMN "comment_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill comment_count from existing approved, non-deleted comments
UPDATE "recipes"
SET "comment_count" = (
  SELECT COUNT(*)::int
  FROM "comments"
  WHERE "comments"."recipe_id" = "recipes"."id"
    AND "comments"."deleted_at" IS NULL
    AND "comments"."moderation_status" = 'approved'
);

-- Indexes for new columns
CREATE INDEX "recipes_category_idx" ON "recipes" ("category");
CREATE INDEX "recipes_cuisine_idx" ON "recipes" ("cuisine");
CREATE INDEX "recipes_comment_count_idx" ON "recipes" ("comment_count" DESC);
