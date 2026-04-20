-- Runs once, on first volume init, before Prisma ever connects.
-- Postgres extensions live outside the migration history, so we create them here.
CREATE EXTENSION IF NOT EXISTS citext;
