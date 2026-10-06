-- The FeatureFlag model shipped without a migration, so the table never existed
-- and the admin panel's Feature Flag tab failed on open. Created here with the
-- tri-state `state` column the app reads through GET /api/v1/flags.
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'default',
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- One row per app flag, left on `default` so nothing changes until an admin
-- flips it.
INSERT INTO "feature_flags" ("key", "state", "description") VALUES
    ('instagramAutomations', 'default', 'Connect with Instagram + comment-to-DM rules. App default: dev builds only.');
