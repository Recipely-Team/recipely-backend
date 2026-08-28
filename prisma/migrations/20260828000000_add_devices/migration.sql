-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "app_version" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devices_device_id_idx" ON "devices"("device_id");

-- CreateIndex
CREATE INDEX "devices_user_id_last_login_at_idx" ON "devices"("user_id", "last_login_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "devices_user_id_device_id_key" ON "devices"("user_id", "device_id");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

