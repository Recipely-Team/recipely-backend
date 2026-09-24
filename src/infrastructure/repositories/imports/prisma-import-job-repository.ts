import { SourcePlatform, type SourcePlatformType } from '@domain/recipes/source-platform';
import { Prisma, type PrismaClient, type ImportJob as ImportJobRow } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { ImportJob } from '@domain/imports/import-job';
import type {
  ImportJobRepositoryInterface,
  ClaimNextImportJobInput,
  FailExhaustedImportJobsInput,
} from '@domain/imports/import-job-repository-interface';
import { ImportJobStatus } from '@domain/imports/import-job-status';
import { ImportJobRowMapper } from '@infrastructure/prisma/mappers/import-job.row-mapper';

/**
 * The column list every raw statement returns.
 *
 * `$queryRaw` hands back the database's own column names, not the camelCase
 * ones Prisma's typed client maps to — so without these aliases every
 * `@map`-ed field arrives as `undefined` and the row mapper silently builds a
 * job with no owner. Aliasing here keeps the raw rows the same shape as the
 * generated `ImportJob` type, which is what makes the mapper reusable.
 */
const RETURNED_COLUMNS = Prisma.sql`
  id,
  owner_id   AS "ownerId",
  url,
  locale,
  status,
  claimed_by AS "claimedBy",
  claimed_at AS "claimedAt",
  attempts,
  draft_id   AS "draftId",
  error_key  AS "errorKey",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export class PrismaImportJobRepository implements ImportJobRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async create(job: ImportJob, platform: SourcePlatformType): Promise<Result<ImportJob, Failure>> {
    try {
      const raw = job.toRaw();
      const row = await this.prisma.importJob.create({
        data: {
          id: raw.id,
          ownerId: raw.ownerId,
          url: raw.url,
          sourcePlatform: platform,
          locale: raw.locale,
          status: raw.status,
          attempts: raw.attempts,
        },
      });
      return ImportJobRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getById(id: string): Promise<Result<ImportJob, Failure>> {
    try {
      const row = await this.prisma.importJob.findUnique({ where: { id } });
      if (!row) return fail(new NotFoundFailure('errors.not_found.import_job'));
      return ImportJobRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async countInFlightByOwner(ownerId: string): Promise<Result<number, Failure>> {
    try {
      const count = await this.prisma.importJob.count({
        where: {
          ownerId,
          status: { in: [ImportJobStatus.Queued, ImportJobStatus.Running] },
        },
      });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async countQueuedAhead(job: ImportJob): Promise<Result<number, Failure>> {
    try {
      const count = await this.prisma.importJob.count({
        where: {
          status: ImportJobStatus.Queued,
          createdAt: { lt: job.createdAt },
        },
      });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  /**
   * @remarks
   * - **Why one statement and not read-then-write.** Two workers polling the
   *   same table will read the same top row microseconds apart; both would then
   *   claim it and both would run the same import, producing two drafts and two
   *   notifications for one request. `FOR UPDATE SKIP LOCKED` is what makes the
   *   read and the claim indivisible: the second worker does not block on the
   *   locked row, it skips past it to the next one, which is exactly the
   *   behaviour a queue wants.
   * - **Why expired claims are selected too.** A worker killed mid-import
   *   reports nothing, so its row would sit in `running` forever and the user
   *   would wait for a notification that is never sent. Treating a stale claim
   *   as runnable is what makes the queue survive a worker dying.
   * - **Why `attempts` bounds it.** A URL that crashes whatever picks it up
   *   would otherwise be handed to every worker in turn, forever, taking the
   *   fleet down one box at a time.
   * - **`ORDER BY created_at` is the fairness rule** — oldest request first.
   *   Without it Postgres is free to return whichever row is cheapest to reach,
   *   and a busy queue would starve whoever asked first.
   */
  async claimNext(input: ClaimNextImportJobInput): Promise<Result<ImportJob | null, Failure>> {
    const leaseCutoff = new Date(input.now.getTime() - input.leaseMs);

    try {
      const rows = await this.prisma.$queryRaw<ImportJobRow[]>`
        UPDATE import_jobs
        SET status     = ${ImportJobStatus.Running},
            claimed_by = ${input.workerId},
            claimed_at = ${input.now},
            attempts   = attempts + 1,
            updated_at = ${input.now}
        WHERE id = (
          SELECT id FROM import_jobs
          WHERE attempts < ${input.maxAttempts}
            AND (${input.acceptsWeb}::boolean OR source_platform IS DISTINCT FROM ${SourcePlatform.Web}::"SourcePlatform")
            AND (
              status = ${ImportJobStatus.Queued}
              OR (status = ${ImportJobStatus.Running} AND claimed_at < ${leaseCutoff})
            )
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING ${RETURNED_COLUMNS}
      `;

      const row = rows[0];
      // An empty queue is the normal case, not a failure.
      if (row === undefined) return ok(null);

      return ImportJobRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async save(job: ImportJob): Promise<Result<ImportJob, Failure>> {
    try {
      const raw = job.toRaw();
      const row = await this.prisma.importJob.update({
        where: { id: raw.id },
        data: {
          status: raw.status,
          claimedBy: raw.claimedBy,
          claimedAt: raw.claimedAt,
          attempts: raw.attempts,
          draftId: raw.draftId,
          errorKey: raw.errorKey,
        },
      });
      return ImportJobRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  /**
   * Ends jobs that have used up their attempts, and says which they were.
   *
   * @remarks
   * Without this a job that exhausts `maxAttempts` stops being claimable but
   * never reaches a terminal state — so it disappears from the queue while the
   * user's screen still says "importing", forever. The rows are returned rather
   * than merely counted because the caller owes each owner a notification: a
   * failure the user is never told about is the same as a hang.
   *
   * The lease guard is what keeps this from killing a job that is genuinely
   * still running its final attempt.
   */
  async failExhausted(input: FailExhaustedImportJobsInput): Promise<Result<ImportJob[], Failure>> {
    const leaseCutoff = new Date(input.now.getTime() - input.leaseMs);

    try {
      const rows = await this.prisma.$queryRaw<ImportJobRow[]>`
        UPDATE import_jobs
        SET status     = ${ImportJobStatus.Failed},
            error_key  = ${input.errorKey},
            claimed_by = NULL,
            updated_at = ${input.now}
        WHERE status IN (${ImportJobStatus.Queued}, ${ImportJobStatus.Running})
          AND attempts >= ${input.maxAttempts}
          AND (claimed_at IS NULL OR claimed_at < ${leaseCutoff})
        RETURNING ${RETURNED_COLUMNS}
      `;

      const jobs: ImportJob[] = [];
      for (const row of rows) {
        const mapped = ImportJobRowMapper.toDomain(row);
        // A corrupt row must not cost the other owners their notifications.
        if (!mapped.ok) continue;
        jobs.push(mapped.value);
      }
      return ok(jobs);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
