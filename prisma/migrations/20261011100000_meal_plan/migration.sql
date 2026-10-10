-- Per-user weekly meal plan (/api/v1/me/meal-plan). A planned recipe for a
-- client calendar day and a meal slot. `food_log_entry_id` links the diary
-- entry made when the plan was eaten; deleting that entry clears the link.
-- Additive only. Rows are hard-deleted with the user's diary (purgeUser).

-- CreateTable
CREATE TABLE "meal_plan_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "meal" "MealSlot" NOT NULL,
    "recipe_id" UUID NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,
    "food_log_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plan_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_entries_food_log_entry_id_key" ON "meal_plan_entries"("food_log_entry_id");

-- CreateIndex
CREATE INDEX "meal_plan_entries_user_id_date_idx" ON "meal_plan_entries"("user_id", "date");

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_food_log_entry_id_fkey" FOREIGN KEY ("food_log_entry_id") REFERENCES "food_log_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

