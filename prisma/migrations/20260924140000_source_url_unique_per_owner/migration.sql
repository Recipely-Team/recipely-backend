-- A source URL is unique per owner, not across the whole table.
--
-- The global key dates from the food.com import, where it made re-running the
-- script an upsert. Once publishing started copying an import's URL onto the
-- recipe, it also meant the SECOND person to import and publish the same reel
-- got "recipe already exists" — the reel had been claimed by whoever was first.
--
-- No row can violate the new index: every existing (owner, url) pair was
-- already unique under the stricter one it replaces.
DROP INDEX "recipes_source_url_key";

CREATE UNIQUE INDEX "recipes_owner_id_source_url_key" ON "recipes"("owner_id", "source_url");
