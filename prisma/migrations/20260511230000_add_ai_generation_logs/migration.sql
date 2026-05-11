-- CreateTable
CREATE TABLE "ai_generation_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_prompt" TEXT NOT NULL,
    "generated_recipe_id" UUID,
    "provider" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_generation_logs_user_id_created_at_idx" ON "ai_generation_logs"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generation_logs" ADD CONSTRAINT "ai_generation_logs_generated_recipe_id_fkey" FOREIGN KEY ("generated_recipe_id") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
