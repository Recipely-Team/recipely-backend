CREATE TABLE IF NOT EXISTS "pending_registrations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" CITEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pending_registrations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pending_registrations_email_key" ON "pending_registrations"("email");
CREATE INDEX IF NOT EXISTS "pending_registrations_expires_at_idx" ON "pending_registrations"("expires_at");
