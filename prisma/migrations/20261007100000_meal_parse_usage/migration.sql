-- Daily per-user count of meal parses (POST /api/v1/diary/meal-parse), the
-- cost cap on its model calls. A count only: the parsed text and photo are
-- never stored.
CREATE TABLE "meal_parse_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meal_parse_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meal_parse_usage_user_id_day_key" ON "meal_parse_usage"("user_id", "day");

CREATE INDEX "meal_parse_usage_day_idx" ON "meal_parse_usage"("day");

ALTER TABLE "meal_parse_usage" ADD CONSTRAINT "meal_parse_usage_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
