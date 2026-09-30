-- Food diary, aligned with the finished design.
--
-- Additive / relaxing only: entry macros become nullable (a recipe can carry
-- calories with no macro breakdown), goals gain a fiber target, and the goal
-- column defaults move to the design's values. 20260930120000_food_diary was
-- already applied on dev, so it is amended here rather than edited.

-- AlterTable
ALTER TABLE "food_log_entries" ALTER COLUMN "protein" DROP NOT NULL,
ALTER COLUMN "carbs" DROP NOT NULL,
ALTER COLUMN "fat" DROP NOT NULL;

-- AlterTable
ALTER TABLE "nutrition_goals" ADD COLUMN     "fiber" DOUBLE PRECISION NOT NULL DEFAULT 30,
ALTER COLUMN "protein" SET DEFAULT 120,
ALTER COLUMN "carbs" SET DEFAULT 230,
ALTER COLUMN "fat" SET DEFAULT 65;


-- Water is now 0..12 glasses a day and the goal 1..12. Rows saved under the
-- old 30-glass cap would otherwise fail validation when read back.
UPDATE "diary_day_water" SET "glasses" = 12 WHERE "glasses" > 12;
UPDATE "nutrition_goals" SET "water_glasses" = 12 WHERE "water_glasses" > 12;
