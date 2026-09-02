import { ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import type { ImportJobRepositoryInterface } from '@domain/imports/import-job-repository-interface';
import type { ImportJob } from '@domain/imports/import-job';
import { ImportJobStatus } from '@domain/imports/import-job-status';
import { ImportJobMapper } from '@application/imports/mappers/import-job.mapper';
import type { ImportJobDto } from '@application/imports/dtos/import-job.dto';

export interface GetImportJobInput {
  readonly jobId: string;
  readonly requesterId: string;
}

/**
 * Reads back a job the caller asked for.
 *
 * @remarks
 * - **Why this exists when a push already fires.** A push is not a delivery
 *   guarantee: notifications can be disabled, the token can be stale, the phone
 *   can be offline. This is what lets a screen that is open right now show the
 *   result without waiting for a notification that may never arrive.
 * - **A job belonging to someone else is `not_found`, not `forbidden`.** A
 *   `forbidden` on a real id and `not_found` on a fake one is an oracle: it
 *   confirms which ids exist. Job ids are UUIDs, so there is nothing to
 *   enumerate — but answering differently for the two cases would create
 *   something to enumerate.
 */
export class GetImportJobUseCase {
  constructor(private readonly repo: ImportJobRepositoryInterface) {}

  async execute(input: GetImportJobInput): Promise<Result<ImportJobDto, Failure>> {
    const found = await this.repo.getById(input.jobId);
    if (!found.ok) return found;

    if (found.value.ownerId !== input.requesterId) {
      return { ok: false, failure: new NotFoundFailure('errors.not_found.import_job') };
    }

    return ok(ImportJobMapper.toDto(found.value, await this.queuePosition(found.value)));
  }

  /**
   * 1-based place in the queue, or `null` for a job that is not waiting.
   *
   * A failed count is not a failed read: the position is the nicety, the job's
   * state is the answer. Losing the whole response because a COUNT went wrong
   * would trade the thing the caller needs for the thing it merely likes.
   */
  private async queuePosition(job: ImportJob): Promise<number | null> {
    if (job.status !== ImportJobStatus.Queued) return null;

    const ahead = await this.repo.countQueuedAhead(job);
    return ahead.ok ? ahead.value + 1 : null;
  }
}
