import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ImportJobRepositoryInterface } from '@domain/imports/import-job-repository-interface';
import type { OpsAlertNotifierInterface } from '@application/imports/ports/ops-alert-notifier-interface';

const MS_PER_MINUTE = 60_000;

/** When a waiting request is worth an email, and how often the same incident may email again. */
export interface WaitingImportAlertPolicy {
  readonly waitMinutes: number;
  readonly repeatMinutes: number;
}

/**
 * Emails the team when users' import requests have waited longer than
 * `waitMinutes` with no worker picking them up — the failure that went unseen
 * for weeks because the user's screen only says "importing".
 *
 * @remarks
 * - **One email per incident, then one per `repeatMinutes`** while it lasts,
 *   so a dead worker is a reminder, not a flood.
 * - **Recovery resets it**: once the queue is clear, the next incident alerts
 *   at once. The state is in memory; a restart may repeat one alert, never miss one.
 */
export class AlertWaitingImportJobsUseCase {
  private lastAlertAt: Date | null = null;

  constructor(
    private readonly jobs: ImportJobRepositoryInterface,
    private readonly notifier: OpsAlertNotifierInterface,
    private readonly policy: WaitingImportAlertPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<Result<boolean, Failure>> {
    const now = this.now();
    const waiting = await this.jobs.findWaitingSince(new Date(now.getTime() - this.policy.waitMinutes * MS_PER_MINUTE));
    if (!waiting.ok) return waiting;
    if (waiting.value.count === 0 || waiting.value.oldestSince === null) {
      this.lastAlertAt = null;
      return ok(false);
    }
    const sinceLast = this.lastAlertAt === null ? Number.POSITIVE_INFINITY : now.getTime() - this.lastAlertAt.getTime();
    if (sinceLast < this.policy.repeatMinutes * MS_PER_MINUTE) return ok(false);
    this.lastAlertAt = now;
    await this.notifier.importsWaiting({
      count: waiting.value.count,
      oldestWaitMinutes: Math.floor((now.getTime() - waiting.value.oldestSince.getTime()) / MS_PER_MINUTE),
    });
    return ok(true);
  }
}
