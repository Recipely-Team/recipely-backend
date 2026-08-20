-- Voice-assistant daily usage ledger.
--
-- The daily allowance is enforced server-side because the credential the device
-- holds is a bearer token: whatever the app believes about its remaining
-- budget, only this table decides whether another session is minted.
--
-- Keyed on (user_id, day) so a heartbeat is a single upsert with an atomic
-- increment — two devices signed into one account heartbeat concurrently, and a
-- read-modify-write would let the later write discard the earlier one's
-- seconds, leaking budget in exactly the case the ledger exists to cover.
CREATE TABLE "assistant_usage" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assistant_usage_pkey" PRIMARY KEY ("user_id","day")
);

-- The app-wide daily cap sums every row for one day; without this the check
-- runs on every session mint as a sequential scan.
CREATE INDEX "assistant_usage_day_idx" ON "assistant_usage"("day");

ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
