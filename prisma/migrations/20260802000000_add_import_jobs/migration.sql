-- Background import jobs.
--
-- The Instagram import ran inside the HTTP request: ~119 s of yt-dlp,
-- transcription and vision on a 1 OCPU box, with the client holding a socket
-- open throughout. This table is the handoff — the request records the work and
-- returns, a worker claims the row and reports back.

CREATE TABLE "import_jobs" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id"   UUID NOT NULL,
    "url"        TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'queued',
    "claimed_by" TEXT,
    "claimed_at" TIMESTAMP(3),
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "draft_id"   UUID,
    "error_key"  TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- The claim query filters on status and orders by age. Without this it is a
-- sequential scan on every poll, from every worker, forever.
CREATE INDEX "import_jobs_status_created_at_idx" ON "import_jobs"("status", "created_at");

-- "my imports", newest first.
CREATE INDEX "import_jobs_owner_id_created_at_idx" ON "import_jobs"("owner_id", "created_at" DESC);

ALTER TABLE "import_jobs"
  ADD CONSTRAINT "import_jobs_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Where an "import_done" notification points. No FK on purpose: deleting a
-- draft should leave the notification readable rather than cascade it away, and
-- the client already handles a draft that is gone when the notification is
-- tapped.
ALTER TABLE "notifications" ADD COLUMN "draft_id" UUID;
