-- Additive: where the dish sits in each photo, found by a background sweep.
ALTER TABLE "recipes" ADD COLUMN "image_focus_x" DOUBLE PRECISION;
ALTER TABLE "recipes" ADD COLUMN "image_focus_y" DOUBLE PRECISION;
ALTER TABLE "recipes" ADD COLUMN "image_focus_attempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "recipe_media" ADD COLUMN "focus_x" DOUBLE PRECISION;
ALTER TABLE "recipe_media" ADD COLUMN "focus_y" DOUBLE PRECISION;
ALTER TABLE "recipe_media" ADD COLUMN "focus_attempts" INTEGER NOT NULL DEFAULT 0;
