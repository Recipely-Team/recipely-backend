-- Food catalogue for the diary: categories, generic foods and drinks with
-- per-100 g/ml variants, and product references on diary entries. Additive
-- only; the catalogue rows arrive in the data migration that follows.

-- CreateTable
CREATE TABLE "food_categories" (
    "key" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "food_categories_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "default_unit" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "food_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "kcal" DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "fiber" DOUBLE PRECISION,
    "sugar" DOUBLE PRECISION,
    "salt" DOUBLE PRECISION,
    "serving_units" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'curated',

    CONSTRAINT "food_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "foods_slug_key" ON "foods"("slug");

-- CreateIndex
CREATE INDEX "foods_category_idx" ON "foods"("category");

-- CreateIndex
CREATE UNIQUE INDEX "food_variants_food_id_key_key" ON "food_variants"("food_id", "key");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_category_fkey" FOREIGN KEY ("category") REFERENCES "food_categories"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_variants" ADD CONSTRAINT "food_variants_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "food_log_entries" ADD COLUMN     "product_source" TEXT,
ADD COLUMN     "food_variant_id" UUID,
ADD COLUMN     "off_barcode" VARCHAR(32),
ADD COLUMN     "unit_key" VARCHAR(16),
ADD COLUMN     "unit_amount" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "food_log_entries" ADD CONSTRAINT "food_log_entries_food_variant_id_fkey" FOREIGN KEY ("food_variant_id") REFERENCES "food_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
