-- The language a device last used the app in, so a push sent to its owner
-- (a followed creator's new recipe) can be written in it. Additive, nullable.
ALTER TABLE "devices" ADD COLUMN "locale" TEXT;
