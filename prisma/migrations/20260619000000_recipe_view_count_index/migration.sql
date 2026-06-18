-- Index view_count descending so the trending sort stays cheap as the table grows.
CREATE INDEX "recipes_is_published_view_count_idx" ON "recipes"("is_published", "view_count" DESC);
