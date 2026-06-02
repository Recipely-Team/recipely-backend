-- CreateTable
CREATE TABLE "recipe_drafts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "snapshot" JSON NOT NULL,
    "chat_history" JSON NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_drafts_owner_id_updated_at_idx" ON "recipe_drafts"("owner_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "recipe_drafts" ADD CONSTRAINT "recipe_drafts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
