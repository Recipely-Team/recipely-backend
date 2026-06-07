-- Give the composite-key join tables a single-column surrogate primary key so
-- they become first-class AdminJS resources. The original (a,b) pair is kept as
-- a UNIQUE constraint, so Prisma's named composite selectors (e.g.
-- `userId_recipeId`, `followerId_followingId`) keep working unchanged.
--
-- gen_random_uuid() is built into PostgreSQL 13+ (core), used here to backfill
-- ids for existing rows. The DB-level default is dropped afterwards because
-- Prisma generates the uuid at the application layer (@default(uuid())).

-- ---------- favorites ----------
ALTER TABLE "favorites" DROP CONSTRAINT "favorites_pkey";
ALTER TABLE "favorites" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "favorites" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "favorites_user_id_recipe_id_key" ON "favorites"("user_id", "recipe_id");

-- ---------- recipe_likes ----------
ALTER TABLE "recipe_likes" DROP CONSTRAINT "recipe_likes_pkey";
ALTER TABLE "recipe_likes" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "recipe_likes" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "recipe_likes" ADD CONSTRAINT "recipe_likes_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "recipe_likes_user_id_recipe_id_key" ON "recipe_likes"("user_id", "recipe_id");

-- ---------- comment_likes ----------
ALTER TABLE "comment_likes" DROP CONSTRAINT "comment_likes_pkey";
ALTER TABLE "comment_likes" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "comment_likes" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "comment_likes_user_id_comment_id_key" ON "comment_likes"("user_id", "comment_id");

-- ---------- user_follows ----------
ALTER TABLE "user_follows" DROP CONSTRAINT "user_follows_pkey";
ALTER TABLE "user_follows" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "user_follows" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "user_follows_follower_id_following_id_key" ON "user_follows"("follower_id", "following_id");
