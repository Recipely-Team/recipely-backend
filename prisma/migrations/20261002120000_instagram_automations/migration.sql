-- Instagram automations: a creator's linked Instagram account (encrypted
-- token), comment-to-DM rules, the private replies sent, and the webhook
-- event queue. Additive only.

-- CreateTable
CREATE TABLE "instagram_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "media_id" TEXT NOT NULL,
    "media_permalink" TEXT,
    "media_thumbnail" TEXT,
    "media_caption" TEXT,
    "keywords" TEXT[],
    "recipe_id" UUID NOT NULL,
    "dm_text" TEXT NOT NULL,
    "public_reply_text" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dm_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dm_sends" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "comment_id" TEXT NOT NULL,
    "commenter_id" TEXT,
    "commenter_username" TEXT,
    "comment_text" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "public_replied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "dm_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ig_user_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "event_time" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "instagram_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_connections_user_id_key" ON "instagram_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_connections_ig_user_id_key" ON "instagram_connections"("ig_user_id");

-- CreateIndex
CREATE INDEX "instagram_connections_status_token_expires_at_idx" ON "instagram_connections"("status", "token_expires_at");

-- CreateIndex
CREATE INDEX "dm_rules_user_id_created_at_idx" ON "dm_rules"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dm_rules_media_id_enabled_idx" ON "dm_rules"("media_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "dm_sends_comment_id_key" ON "dm_sends"("comment_id");

-- CreateIndex
CREATE INDEX "dm_sends_rule_id_created_at_idx" ON "dm_sends"("rule_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "dm_sends_user_id_idx" ON "dm_sends"("user_id");

-- CreateIndex
CREATE INDEX "instagram_events_status_available_at_idx" ON "instagram_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "instagram_events_ig_user_id_idx" ON "instagram_events"("ig_user_id");

-- AddForeignKey
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_rules" ADD CONSTRAINT "dm_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_rules" ADD CONSTRAINT "dm_rules_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dm_sends" ADD CONSTRAINT "dm_sends_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "dm_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
