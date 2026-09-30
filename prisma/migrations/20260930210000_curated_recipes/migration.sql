-- Curated recipes: the ones Recipely publishes itself, under the official
-- "Recipely Mutfağı" account.
--
-- Additive only. Existing rows keep their origin and get NULL in every new
-- column, which reads as "no credit, estimated nutrition, no slug".

-- A new origin. ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction that adds it, and nothing below uses it.
ALTER TYPE "RecipeOrigin" ADD VALUE 'CURATED';

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "image_credit_author" TEXT,
ADD COLUMN     "image_credit_license" TEXT,
ADD COLUMN     "image_credit_url" TEXT,
ADD COLUMN     "nutrition_source" TEXT,
ADD COLUMN     "image_source_hash" TEXT,
ADD COLUMN     "slug" TEXT;

-- The curated import's key is (owner, slug), so a re-run updates the recipe it
-- made instead of adding a second one. Partial, so the NULL slug on every other
-- recipe is not a key at all; Prisma's schema language cannot express the
-- WHERE clause, so this index lives only here.
CREATE UNIQUE INDEX "recipes_owner_id_slug_key" ON "recipes"("owner_id", "slug") WHERE "slug" IS NOT NULL;
