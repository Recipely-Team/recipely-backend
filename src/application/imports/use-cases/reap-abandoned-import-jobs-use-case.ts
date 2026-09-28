import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ImportJobRepositoryInterface } from '@domain/imports/import-job-repository-interface';
import type { NotificationService } from '@application/notifications/notification-service';
import type { TranslationService } from '@application/i18n/translation-service';
import { ImportNotificationKeys } from '@application/imports/import-notification-keys';
import type { LoggerInterface } from '@application/ports/logger-interface';

/** Key stored on a job nobody could finish. */
const ABANDONED_ERROR_KEY = 'errors.import.abandoned';

/**
 * Ends jobs no worker will ever finish, and tells their owners.
 *
 * @remarks
 * - **The gap this closes.** `claimNext` stops handing out a job once it has
 *   used up its attempts — but stopping being claimable is not the same as
 *   finishing. Without this the row sits in `queued` forever, invisible to
 *   every worker, while the user's screen says "importing" until they reinstall
 *   the app. Silence is the worst failure mode available here, because it is
 *   the one the user cannot act on.
 * - **Why it runs on a timer and not on the claim path.** A queue with nothing
 *   in it is never polled hard enough to notice its own stuck rows, and the
 *   claim query has to stay a single statement to remain atomic. A tick is the
 *   only place that can look at rows nobody is asking for.
 * - **Safe to run on every box.** The reap is one conditional `UPDATE`, so two
 *   instances racing it produce one winner and one empty result set — the
 *   loser's `RETURNING` is empty and it notifies nobody.
 */
export class ReapAbandonedImportJobsUseCase {
  constructor(
    private readonly jobs: ImportJobRepositoryInterface,
    private readonly notifications: NotificationService,
    private readonly ts: TranslationService,
    private readonly logger: LoggerInterface,
    private readonly leaseMs: number,
    private readonly maxAttempts: number,
  ) {}

  async execute(): Promise<Result<number, Failure>> {
    const reaped = await this.jobs.failExhausted({
      maxAttempts: this.maxAttempts,
      leaseMs: this.leaseMs,
      now: new Date(),
      errorKey: ABANDONED_ERROR_KEY,
    });
    if (!reaped.ok) return reaped;

    for (const job of reaped.value) {
      this.logger.warn({ jobId: job.id, attempts: job.attempts }, 'import_job_abandoned');
      void this.notifications
        .notify({
          recipientId: job.ownerId,
          type: 'import_done',
          title: this.ts.t(ImportNotificationKeys.failedTitle, job.locale),
          body: this.ts.t(ImportNotificationKeys.failedBody, job.locale),
          ...(job.sourcePlatform !== null ? { sourcePlatform: job.sourcePlatform } : {}),
        })
        .catch((err: unknown) => this.logger.warn({ err }, 'import_job_reap_notify_failed'));
    }

    return ok(reaped.value.length);
  }
}
