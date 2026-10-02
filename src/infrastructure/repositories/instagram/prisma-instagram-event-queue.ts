import type { Prisma, PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { InstagramEventStatus } from '@domain/instagram/instagram-event-status';
import type {
  InstagramEventInput,
  InstagramEventQueueInterface,
  QueuedInstagramEvent,
} from '@application/instagram/ports/instagram-event-queue-interface';

/** How long a claim holds an event before another tick may take it (a crashed tick's events come back). */
const LEASE_MS = 5 * 60 * 1000;
const ERROR_MAX = 300;

/**
 * **`instagram_events`** — the webhook's queue, drained by the in-process worker.
 *
 * @remarks
 * - `enqueue` skips an event whose `dedupe_key` is already queued, so a
 *   comment the webhook and the poller both saw is one row.
 * - A claim is one statement: it picks due rows with `FOR UPDATE SKIP LOCKED`,
 *   bumps their attempt count and pushes `available_at` out by a lease, so two
 *   ticks (or two API processes) never take the same row, and a tick that dies
 *   mid-batch leaves its rows to be claimed again after the lease.
 */
export class PrismaInstagramEventQueue implements InstagramEventQueueInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueue(events: readonly InstagramEventInput[], now: Date): Promise<Result<number, Failure>> {
    try {
      const { count } = await this.prisma.instagramEvent.createMany({
        skipDuplicates: true,
        data: events.map((event) => ({
          igUserId: event.igUserId,
          field: event.field,
          payload: event.payload as Prisma.InputJsonValue,
          eventTime: event.eventTime,
          status: InstagramEventStatus.Queued,
          // Written from the app clock, like every time the claim compares
          // against — the database's own now() may run in another zone.
          availableAt: now,
          createdAt: now,
          dedupeKey: event.dedupeKey ?? null,
        })),
      });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async claim(now: Date, limit: number): Promise<Result<QueuedInstagramEvent[], Failure>> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; igUserId: string; field: string; payload: unknown; eventTime: Date; attempts: number }>
      >`
        UPDATE instagram_events SET attempts = attempts + 1, available_at = ${new Date(now.getTime() + LEASE_MS)}
        WHERE id IN (
          SELECT id FROM instagram_events
          WHERE status = ${InstagramEventStatus.Queued} AND available_at <= ${now}
          ORDER BY created_at ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, ig_user_id AS "igUserId", field, payload, event_time AS "eventTime", attempts`;
      return ok(rows);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  done(id: string, now: Date): Promise<Result<void, Failure>> {
    return this.set(id, { status: InstagramEventStatus.Done, processedAt: now });
  }

  retryAt(id: string, at: Date, error: string): Promise<Result<void, Failure>> {
    return this.set(id, { availableAt: at, lastError: error.slice(0, ERROR_MAX) });
  }

  failed(id: string, error: string, now: Date): Promise<Result<void, Failure>> {
    return this.set(id, { status: InstagramEventStatus.Failed, lastError: error.slice(0, ERROR_MAX), processedAt: now });
  }

  async prune(before: Date): Promise<Result<number, Failure>> {
    try {
      const { count } = await this.prisma.instagramEvent.deleteMany({
        where: { status: { in: [InstagramEventStatus.Done, InstagramEventStatus.Failed] }, processedAt: { lt: before } },
      });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  private set(id: string, data: Prisma.InstagramEventUpdateInput): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      await this.prisma.instagramEvent.update({ where: { id }, data });
    });
  }

  private async guard(write: () => Promise<void>): Promise<Result<void, Failure>> {
    try {
      await write();
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
