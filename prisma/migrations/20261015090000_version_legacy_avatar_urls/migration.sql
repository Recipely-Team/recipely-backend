-- Gives every avatar saved before uploads were versioned (#325) a versioned
-- address. Those uploads overwrote one fixed address, and the app's image
-- cache keys by address and never revalidates, so a phone kept showing the
-- photo it first saw while the web showed the new one. The version is the
-- row's last update time; the file is unchanged. Data only, idempotent.

UPDATE "users"
SET "photo_url" = "photo_url" || '?v=' || (EXTRACT(EPOCH FROM "updated_at") * 1000)::bigint
WHERE "photo_url" LIKE '%/uploads/avatars/%'
  AND "photo_url" NOT LIKE '%?%';
