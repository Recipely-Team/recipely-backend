-- A source URL is unique per owner among LIVE recipes only.
--
-- Deleting a recipe is a soft delete, and the full index kept counting the
-- tombstone: an owner who deleted an imported recipe could never save the same
-- link again — "a recipe from this link already exists", with nothing visible
-- to delete. The tombstone keeps its URL (a deleted recipe can be restored),
-- so the uniqueness moves to the rows that are still live.
--
-- Prisma cannot declare a partial unique index, so the model no longer carries
-- `@@unique([ownerId, sourceUrl])`; this index is the constraint, the same way
-- the listing indexes in 20260518000000_add_recipe_soft_delete are.
--
-- Restoring a tombstone whose link has since been saved again will now fail on
-- this index, which is the right answer: the owner already has that recipe.
DROP INDEX "recipes_owner_id_source_url_key";

CREATE UNIQUE INDEX "recipes_owner_id_source_url_key"
  ON "recipes"("owner_id", "source_url")
  WHERE "deleted_at" IS NULL;
