-- What a web import arrived as, so publishing can refuse the site's own photo
-- and text until the owner has replaced them. Additive and nullable: existing
-- rows read NULL, which the gate treats as "nothing to compare against".
ALTER TABLE "recipes" ADD COLUMN "imported_image" TEXT;
ALTER TABLE "recipes" ADD COLUMN "imported_ingredients_hash" TEXT;
ALTER TABLE "recipes" ADD COLUMN "imported_instructions_hash" TEXT;
