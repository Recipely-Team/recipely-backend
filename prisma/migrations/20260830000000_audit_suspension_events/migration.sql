-- Suspension and un-suspension become part of the account audit trail.
--
-- `User.suspensionReason` is wiped when a ban is lifted, so before this the act
-- of lifting one erased every trace that it had ever happened — no when, no
-- why, no who. Repeat offences looked like first offences and no moderator
-- decision was attributable to anyone.
--
-- Additive only: two enum values and two nullable columns. Nothing is dropped
-- and no type changes, so existing rows and readers are untouched. Postgres 16
-- on the host, so both ADD VALUEs are fine in one migration (the warning below
-- is Prisma's boilerplate for 11 and earlier).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountEventType" ADD VALUE 'SUSPENDED';
ALTER TYPE "AccountEventType" ADD VALUE 'UNSUSPENDED';

-- AlterTable
ALTER TABLE "account_event_logs" ADD COLUMN     "actor_id" UUID,
ADD COLUMN     "reason" TEXT;

