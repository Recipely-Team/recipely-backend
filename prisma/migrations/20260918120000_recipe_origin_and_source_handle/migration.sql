-- Where a recipe came from, as a fact the row carries.
--
-- It was derivable and nowhere: an import left `source_url` set, and a
-- generation left a row in `ai_generation_logs` pointing back at the recipe. So
-- answering "was this written by a machine?" for a LIST of recipes meant a join
-- against a log table on every card, which is not a thing a feed can do.
--
-- Additive only: one column with a default and one nullable column. Nothing is
-- dropped, no type changes, and every existing reader keeps working — the
-- default is the answer for a recipe a person typed out, which is what a row
-- with neither marker is.
CREATE TYPE "RecipeOrigin" AS ENUM ('USER', 'AI', 'IMPORT');

ALTER TABLE "recipes" ADD COLUMN "origin" "RecipeOrigin" NOT NULL DEFAULT 'USER';

-- The account a reel was lifted from, as the handle Instagram shows it under.
-- Stored without the '@' so a link can be built from it without stripping one.
ALTER TABLE "recipes" ADD COLUMN "source_handle" TEXT;

-- Backfill what is knowable, which is less than it looks.
--
-- `ai_generation_logs.generated_recipe_id` is written as NULL at every call
-- site — the log records that a generation happened and never which recipe came
-- out of it — so there is no way to recover which existing rows a model wrote.
-- `source_url` is likewise never set by the app: an Instagram import produces a
-- DRAFT, and publishing that draft created a recipe that kept no link to the
-- post. So this statement is expected to match nothing today, and is here for
-- any row that does carry one rather than as the migration's purpose.
--
-- Every other existing recipe therefore stays `USER`, which is a claim this
-- column cannot verify for history. It is right going forward and silent about
-- the past, and saying so here is better than a backfill that guesses.
UPDATE "recipes" SET "origin" = 'IMPORT' WHERE "source_url" IS NOT NULL;

-- Feeds filter and count on it; a sequential scan over every recipe to find the
-- imported ones is the query this column exists to avoid.
CREATE INDEX "recipes_origin_idx" ON "recipes"("origin");
