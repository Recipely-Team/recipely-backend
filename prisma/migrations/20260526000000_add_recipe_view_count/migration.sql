-- AlterTable: add view_count to recipes
ALTER TABLE "recipes" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
