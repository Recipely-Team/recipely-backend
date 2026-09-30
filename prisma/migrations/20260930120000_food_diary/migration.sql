-- Food diary: a per-user calorie and nutrient log, daily water, and goals.
--
-- Additive only — three new tables and one enum. `date` is a DATE (the
-- client's local calendar day), never a timestamp, so a late dinner cannot
-- drift into the next day for a server in another zone.

-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateTable
CREATE TABLE "food_log_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "meal" "MealSlot" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION,
    "recipe_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_day_water" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "glasses" INTEGER NOT NULL,

    CONSTRAINT "diary_day_water_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "calories" INTEGER NOT NULL DEFAULT 2000,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 250,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "water_glasses" INTEGER NOT NULL DEFAULT 8,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "food_log_entries_user_id_date_idx" ON "food_log_entries"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "diary_day_water_user_id_date_key" ON "diary_day_water"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "nutrition_goals_user_id_key" ON "nutrition_goals"("user_id");

-- AddForeignKey
ALTER TABLE "food_log_entries" ADD CONSTRAINT "food_log_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_log_entries" ADD CONSTRAINT "food_log_entries_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_day_water" ADD CONSTRAINT "diary_day_water_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_goals" ADD CONSTRAINT "nutrition_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

