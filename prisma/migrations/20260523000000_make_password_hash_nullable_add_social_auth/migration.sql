-- Make password_hash nullable to support social-auth (Google / Apple) users
-- who never set a password. Existing rows are unaffected.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
