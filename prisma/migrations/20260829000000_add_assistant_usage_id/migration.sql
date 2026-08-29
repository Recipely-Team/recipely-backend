-- Give the composite-key AssistantUsage table a single-column surrogate
-- primary key so it becomes a first-class AdminJS resource (same shape as
-- 20260607120000_add_surrogate_ids_to_join_tables). The original (user_id,
-- day) pair is kept as a UNIQUE constraint, so Prisma's named composite
-- selector (`userId_day`) keeps working unchanged.
--
-- gen_random_uuid() is built into PostgreSQL 13+ (core), used here to backfill
-- ids for existing rows. The DB-level default is dropped afterwards because
-- Prisma generates the uuid at the application layer (@default(uuid())).

ALTER TABLE "assistant_usage" DROP CONSTRAINT "assistant_usage_pkey";
ALTER TABLE "assistant_usage" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "assistant_usage" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "assistant_usage_user_id_day_key" ON "assistant_usage"("user_id", "day");
