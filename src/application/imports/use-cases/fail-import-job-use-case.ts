import { ok, type Result } from '@core/result/result';
import { ConflictFailure, ForbiddenFailure, type Failure } from '@core/failure';
import type { IImportJobRepository } from '@domain/imports/i-import-job-repository';
import type { NotificationService } from '@application/notifications/notification-service';
import type { TranslationService } from '@application/i18n/translation-service';
import { ImportNotificationKeys } from '@application/imports/import-notification-keys';
import type { ILogger } from '@application/ports/i-logger';
import { ImportJobMapper } from '@application/imports/mappers/import-job.mapper';
import type { ImportJobDto } from '@application/imports/dtos/import-job.dto';

export interface FailImportJobInput {
  readonly jobId: string;
  readonly workerId: string;
  /** Machine key naming what went wrong; the client turns it into a sentence. */
  readonly errorKey: string;
}

/**
 * Records that an import will not produce a draft, and says so.
 *
 * @remarks
 * - **A failure the user is not told about is indistinguishable from a hang.**
 *   The screen that started the import has no other way to learn the job ended:
 *   the request returned long ago. So a failure notifies exactly like a success
 *   does.
 * - **Only the holder may report.** A worker whose lease expired mid-import has
 *   had its job re-run by someone else; letting it report would overwrite a
 *   result that may already have succeeded with a stale failure.
 */
export class FailImportJobUseCase {
  constructor(
    private readonly jobs: IImportJobRepository,
    private readonly notifications: NotificationService,
    private readonly ts: TranslationService,
    private readonly logger: ILogger,
  ) {}

  async execute(input: FailImportJobInput): Promise<Result<ImportJobDto, Failure>> {
    const found = await this.jobs.getById(input.jobId);
    if (!found.ok) return found;

    const job = found.value;
    if (job.isFinished) {
      return { ok: false, failure: new ConflictFailure('errors.import.job_already_finished') };
    }
    if (job.claimedBy !== input.workerId) {
      return { ok: false, failure: new ForbiddenFailure('errors.import.job_not_claimed_by_worker') };
    }

    const failed = job.markFailed(input.errorKey, new Date());
    if (!failed.ok) return failed;

    const saved = await this.jobs.save(failed.value);
    if (!saved.ok) return saved;

    void this.notifications
      .notify({
        recipientId: job.ownerId,
        type: 'import_done',
        title: this.ts.t(ImportNotificationKeys.failedTitle, job.locale),
        body: this.ts.t(ImportNotificationKeys.failedBody, job.locale),
      })
      .catch((err: unknown) => this.logger.warn({ err }, 'import_job_fail_notify_failed'));

    return ok(ImportJobMapper.toDto(saved.value));
  }
}
