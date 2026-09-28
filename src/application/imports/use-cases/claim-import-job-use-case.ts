import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ImportJobRepositoryInterface } from '@domain/imports/import-job-repository-interface';

export interface ClaimedImportJob {
  readonly jobId: string;
  readonly url: string;
  /** Locale the recipe should be extracted in. */
  readonly locale: string;
}

export interface ClaimImportJobInput {
  readonly workerId: string;
  /** From the worker's own claim request; absent (false) on the previous image. */
  readonly acceptsWeb: boolean;
}

/**
 * Hands a worker its next piece of work, or tells it there is none.
 *
 * @remarks
 * - **Returns `null` rather than failing on an empty queue.** Idle is the
 *   normal state of a worker. A failure here would fill the logs with errors
 *   describing nothing being wrong, and would train whoever reads them to
 *   ignore the one line that mattered.
 * - **The worker is told the URL, not the owner.** It has no business knowing
 *   whose recipe it is: it fetches a link, extracts a recipe and reports back.
 *   Keeping the owner out of the payload means a worker box that is
 *   compromised leaks no user identities.
 * - **Lease and attempt bounds are decided here, not by the worker.** A worker
 *   that chose its own lease could grant itself an infinite one and hold a job
 *   forever.
 * - **The locale travels with the job.** It was captured when the user asked;
 *   by the time a worker runs the job the request is long gone, so anything
 *   derived from it here would be a guess.
 */
export class ClaimImportJobUseCase {
  constructor(
    private readonly repo: ImportJobRepositoryInterface,
    private readonly leaseMs: number,
    private readonly maxAttempts: number,
  ) {}

  async execute(input: ClaimImportJobInput): Promise<Result<ClaimedImportJob | null, Failure>> {
    const claimed = await this.repo.claimNext({
      workerId: input.workerId,
      leaseMs: this.leaseMs,
      maxAttempts: this.maxAttempts,
      now: new Date(),
      acceptsWeb: input.acceptsWeb,
    });
    if (!claimed.ok) return claimed;
    if (claimed.value === null) return ok(null);

    return ok({
      jobId: claimed.value.id,
      url: claimed.value.url,
      locale: claimed.value.locale,
    });
  }
}
