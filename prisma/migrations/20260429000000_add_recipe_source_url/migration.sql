-- AlterTable
ALTER TABLE "recipes" ADD COLUMN "source_url" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "recipes_source_url_key" ON "recipes"("source_url");
