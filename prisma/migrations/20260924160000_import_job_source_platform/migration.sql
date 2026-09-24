-- What kind of link a queued import is, so the claim can keep a web page away
-- from a worker that cannot read one safely.
--
-- A worker still on the previous image hands every URL to yt-dlp, which will
-- fetch a web page's address without checking where it resolves. NULL for the
-- rows already queued: every one of those is an Instagram video.
ALTER TABLE "import_jobs" ADD COLUMN "source_platform" "SourcePlatform";
