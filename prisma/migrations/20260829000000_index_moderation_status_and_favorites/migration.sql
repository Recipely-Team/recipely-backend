-- CreateIndex
CREATE INDEX "recipes_moderation_status_idx" ON "recipes"("moderation_status");

-- CreateIndex
CREATE INDEX "favorites_recipe_id_idx" ON "favorites"("recipe_id");

-- CreateIndex
CREATE INDEX "comments_moderation_status_idx" ON "comments"("moderation_status");

