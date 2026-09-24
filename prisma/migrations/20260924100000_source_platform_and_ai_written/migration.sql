-- Two facts, not three choices.
--
-- `origin` was a single enum (USER | AI | IMPORT), so a recipe could only be
-- one of them. It cannot say what an import actually is: the video comes from
-- an account AND a model turns it into structured text. Every import is both,
-- which made "AI" and "IMPORT" a false choice rather than two options.
--
-- So the orthogonal facts get their own columns. `origin` stays and keeps its
-- meaning — where the TEXT came from — and every existing reader keeps working.
CREATE TYPE "SourcePlatform" AS ENUM ('INSTAGRAM', 'TIKTOK');

ALTER TABLE "recipes" ADD COLUMN "source_platform" "SourcePlatform";
ALTER TABLE "recipes" ADD COLUMN "ai_written" BOOLEAN NOT NULL DEFAULT false;

-- Backfill. What follows is everything the database can actually prove, and
-- deliberately nothing beyond it — this column is a provenance claim, and a
-- wrong one is worse than an absent one.

-- 1. Rows already marked AI or IMPORT were written by a model by definition:
--    a generation is one, and an import runs the vision/transcription pass to
--    produce the text at all.
UPDATE "recipes" SET "ai_written" = true WHERE "origin" IN ('AI', 'IMPORT');

-- 2. Imports recorded before TikTok existed can only have been Instagram.
UPDATE "recipes" SET "source_platform" = 'INSTAGRAM' WHERE "origin" = 'IMPORT';

-- 3. The imports the previous migration could not find.
--
--    It looked at `source_url`, which the publish path never sets, and said so:
--    "this statement is expected to match nothing today". The trace it missed
--    is in the notifications table. An import produces a DRAFT and notifies the
--    cook; publishing that draft calls `repointDraftToRecipe`, which moves that
--    notification off the draft and onto the recipe. So a surviving
--    `import_done` row carrying a `recipe_id` is proof that recipe came from an
--    import, and it is the only proof left — the repoint nulls `draft_id` in
--    the act of creating the link, so the import job, its URL and its handle
--    are not recoverable from here.
UPDATE "recipes" r
SET "origin" = 'IMPORT', "source_platform" = 'INSTAGRAM', "ai_written" = true
FROM "notifications" n
WHERE n."recipe_id" = r."id"
  AND n."type" = 'import_done'
  AND r."origin" = 'USER';

-- What is NOT backfilled, so nobody goes looking for it later:
--
--   * `source_url` and `source_handle` for the rows found in step 3. The draft
--     link is destroyed by the repoint, and a reel URL carries a post id, not
--     an account name.
--   * Recipes generated from a prompt. `ai_generation_logs.generated_recipe_id`
--     is written as NULL at all four call sites, and the `ai_completed`
--     notification type is declared but never created, so a generation that was
--     published leaves no trace tying it to its recipe. Those rows stay USER,
--     which understates them — and understating is the direction to be wrong in
--     when the alternative is labelling someone's own writing as machine-made.

-- The feed filters on the platform the same way it filters on origin.
CREATE INDEX "recipes_source_platform_idx" ON "recipes"("source_platform");
