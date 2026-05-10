-- Drop category foreign key and column from recipes
ALTER TABLE "recipes" DROP CONSTRAINT IF EXISTS "recipes_category_id_fkey";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "category_id";

-- Drop old composite index that included category_id
DROP INDEX IF EXISTS "recipes_is_published_category_id_created_at_idx";

-- Add new composite index without category_id
CREATE INDEX "recipes_is_published_created_at_idx" ON "recipes"("is_published", "created_at" DESC);

-- Add nutrition JSON column
ALTER TABLE "recipes" ADD COLUMN "nutrition" Json;

-- Drop categories table
DROP TABLE IF EXISTS "categories";
