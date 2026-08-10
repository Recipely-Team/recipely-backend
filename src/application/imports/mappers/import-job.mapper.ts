import type { ImportJob } from '@domain/imports/import-job';
import type { ImportJobDto } from '@application/imports/dtos/import-job.dto';

export class ImportJobMapper {
  /**
   * @param queuePosition Where the job sits in the queue, 1-based, or `null`
   * when it is no longer waiting. Defaults to `null` because most callers hold
   * a job that has just moved — a completion has no position to report, and
   * making them pass one would invite a fabricated number.
   */
  static toDto(job: ImportJob, queuePosition: number | null = null): ImportJobDto {
    return {
      id: job.id,
      status: job.status,
      draftId: job.draftId,
      errorKey: job.errorKey,
      queuePosition,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}
