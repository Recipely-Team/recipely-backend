-- Daily per-user count of fridge calls (POST /api/v1/fridge/scan and
-- /fridge/ideas share one allowance), the cost cap on their model calls. A
-- count only: photos and ingredient lists are never stored. Additive.

-- CreateTable
CREATE TABLE "fridge_usage" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fridge_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fridge_usage_day_idx" ON "fridge_usage"("day");

-- CreateIndex
CREATE UNIQUE INDEX "fridge_usage_user_id_day_key" ON "fridge_usage"("user_id", "day");

-- AddForeignKey
ALTER TABLE "fridge_usage" ADD CONSTRAINT "fridge_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

