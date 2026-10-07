-- Per-user shopping list (GET/POST/PATCH/DELETE /api/v1/me/shopping-list).
-- `recipe_id` is deliberately not a foreign key: it and `recipe_name` are a
-- snapshot of where a line came from. Rows are hard-deleted by deleteAccount.

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" VARCHAR(24),
    "recipe_id" UUID,
    "recipe_name" VARCHAR(200),
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_list_items_user_id_checked_position_idx" ON "shopping_list_items"("user_id", "checked", "position");

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
