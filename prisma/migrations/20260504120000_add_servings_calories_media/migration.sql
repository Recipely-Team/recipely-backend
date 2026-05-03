-- AlterTable: add servings + caloriesPerServing on Recipe
ALTER TABLE "recipes" ADD COLUMN "servings" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "recipes" ADD COLUMN "calories_per_serving" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: recipe_media (gallery for detail page)
CREATE TABLE "recipe_media" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recipe_media_recipe_id_position_idx" ON "recipe_media"("recipe_id", "position");

ALTER TABLE "recipe_media" ADD CONSTRAINT "recipe_media_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma's schema models `type` as String to keep room for future media kinds
-- (e.g. audio). Constrain at DB level to the values the mapper actually understands
-- so corrupt rows fail loudly on insert instead of vanishing silently from galleries.
ALTER TABLE "recipe_media" ADD CONSTRAINT "recipe_media_type_check" CHECK ("type" IN ('image', 'video'));
