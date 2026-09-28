-- Additive: where an import notification's recipe came from, so the in-app row
-- can name the platform the push already named. Nullable — older rows have none.
ALTER TABLE "notifications" ADD COLUMN "source_platform" TEXT;
ALTER TABLE "notifications" ADD COLUMN "source_handle" TEXT;
