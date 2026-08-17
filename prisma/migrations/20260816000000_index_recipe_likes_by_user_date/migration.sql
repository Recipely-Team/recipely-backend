-- "My liked recipes", newest first, needs (user_id, created_at DESC).
--
-- The existing unique pair covers (user_id, recipe_id), which answers "did this
-- user like this recipe" but cannot order by date: without this index the liked
-- list scans and sorts every like the user has ever left.
CREATE INDEX "recipe_likes_user_id_created_at_idx" ON "recipe_likes"("user_id", "created_at" DESC);
