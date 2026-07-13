-- Additive only: no column/table is dropped and no type changes, so this applies
-- cleanly to production data on the next `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "AccountEventType" AS ENUM ('DELETED', 'RECREATED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateTable
CREATE TABLE "account_event_logs" (
    "id" UUID NOT NULL,
    "event" "AccountEventType" NOT NULL,
    "user_id" UUID NOT NULL,
    "email_hash" TEXT NOT NULL,
    "previous_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_event_logs_email_hash_created_at_idx" ON "account_event_logs"("email_hash", "created_at" DESC);

-- CreateIndex
CREATE INDEX "account_event_logs_user_id_idx" ON "account_event_logs"("user_id");

-- NOTE: no FK from account_event_logs.user_id to users.id — the audit trail must
-- survive a future hard purge of the tombstoned user row it describes.
