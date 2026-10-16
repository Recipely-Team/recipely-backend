import type { RecipeImporterInterface } from '@application/ai/ports/recipe-importer-interface';
import type { ImportApiClient, ClaimedJob } from '@worker/import-api-client';

export interface ImportWorkerLogger {
  info(context: Record<string, unknown>, message: string): void;
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export interface ImportWorkerOptions {
  readonly pollIntervalMs: number;
  readonly importTimeoutMs: number;
}

/** What a job is reported as when the worker itself broke, not the video. */
const UNKNOWN_ERROR_KEY = 'errors.import.fetch_failed';

/**
 * Pulls work from the queue and runs it, one job at a time, forever.
 *
 * @remarks
 * - **One job at a time, on purpose.** These boxes have 1 GB of RAM and the
 *   pipeline runs ffmpeg over a video. Two concurrent imports on one box do
 *   not finish twice as fast; they finish never, because the kernel kills one.
 *   Concurrency here is more BOXES, which the queue already supports — that is
 *   what `SKIP LOCKED` bought.
 * - **Pull, never push.** Nothing tells a worker about a job. An idle worker
 *   asks, which means a worker can be added, removed or lost with nothing to
 *   reconfigure anywhere else, and a worker behind NAT with no inbound port
 *   works exactly as well as one with a public address.
 * - **A crash mid-job is not handled here, and must not be.** If this process
 *   dies the claim simply expires and another worker picks the job up. Code
 *   that tried to guarantee a report on the way down would be code that runs
 *   at the least reliable moment there is.
 * - **Every failure path reports something.** A worker that swallowed an error
 *   would leave the job running until its lease expired, costing the user
 *   minutes for a failure that was already known.
 */
export class ImportWorker {
  private running = false;
  private stopped = false;

  constructor(
    private readonly api: ImportApiClient,
    private readonly importer: RecipeImporterInterface,
    private readonly logger: ImportWorkerLogger,
    private readonly options: ImportWorkerOptions,
  ) {}

  /** Wakes an in-progress poll wait so shutdown does not sit out the interval. */
  private wake: (() => void) | null = null;

  /** Asks the loop to finish the job in hand and then exit. */
  stop(): void {
    this.stopped = true;
    this.wake?.();
  }

  /**
   * Waits out one poll interval, or until {@link stop} is called.
   *
   * @remarks
   * **The timer is deliberately NOT `unref()`d.** An idle worker has nothing
   * else pending on the event loop, so an unreferenced poll timer lets Node
   * decide the process has no work left and exit — which it did: the container
   * survived exactly one empty poll, exited 0, and `restart: unless-stopped`
   * turned that into a permanent crash loop that looks, in `docker ps`, like a
   * worker that keeps starting. Idle is this process's normal state, so the
   * thing that keeps it alive while idle cannot be optional.
   *
   * Shutdown is handled by waking the wait instead, so holding a reference
   * costs nothing on the way down.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = (): void => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  /**
   * Runs one claimed job to a reported conclusion.
   *
   * Returns nothing: the outcome is reported to the API, not to the caller.
   * The loop only needs to know a job happened, which it already does.
   */
  private async runJob(job: ClaimedJob): Promise<void> {
    const startedAt = Date.now();
    this.logger.info({ jobId: job.jobId }, 'import_job_started');

    try {
      const imported = await this.importer.import({
        url: job.url,
        locale: job.locale,
        signal: AbortSignal.timeout(this.options.importTimeoutMs),
      });

      if (!imported.ok) {
        // The importer already decided which key describes this, and that key
        // is in the client's catalogue. Replacing it with a generic one here
        // would turn "no recipe in this video" into "something went wrong".
        await this.api.fail(job.jobId, imported.failure.messageKey);
        this.logger.warn(
          { jobId: job.jobId, errorKey: imported.failure.messageKey, ms: Date.now() - startedAt },
          'import_job_failed',
        );
        return;
      }

      await this.api.complete(job.jobId, {
        recipe: imported.value.recipe,
        coverFrameJpegBase64: imported.value.coverFrameJpegBase64,
        locale: job.locale,
        sourcePlatform: imported.value.sourcePlatform,
        aiWritten: imported.value.aiWritten,
        ...(imported.value.reading !== undefined ? { reading: imported.value.reading } : {}),
        ...(imported.value.sourceHandle !== undefined
          ? { sourceHandle: imported.value.sourceHandle }
          : {}),
      });
      this.logger.info({ jobId: job.jobId, ms: Date.now() - startedAt }, 'import_job_completed');
    } catch (err) {
      // Reaching here means the worker broke, not the video: a timeout, an
      // out-of-memory kill inside ffmpeg, a bug. Report it so the user is told
      // now rather than when the lease expires — but never let it end the loop,
      // because one poisonous URL must not take the box down. The attempt
      // counter is what stops such a job being retried forever.
      this.logger.error({ jobId: job.jobId, err }, 'import_job_errored');
      try {
        await this.api.fail(job.jobId, UNKNOWN_ERROR_KEY);
      } catch (reportErr) {
        // The API is unreachable. Nothing to do: the lease expires and another
        // worker takes it, which is precisely the case the lease exists for.
        this.logger.error({ jobId: job.jobId, err: reportErr }, 'import_job_report_failed');
      }
    }
  }

  async run(): Promise<void> {
    this.running = true;
    this.logger.info({}, 'import_worker_started');

    while (!this.stopped) {
      let job: ClaimedJob | null = null;
      try {
        job = await this.api.claim();
      } catch (err) {
        // The API being down is a condition to wait out, not to crash on:
        // restarting would only produce the same failure a second sooner, and
        // a crash-looping container hides the real outage behind its own noise.
        this.logger.error({ err }, 'import_job_claim_failed');
        await this.sleep(this.options.pollIntervalMs);
        continue;
      }

      if (job === null) {
        await this.sleep(this.options.pollIntervalMs);
        continue;
      }

      await this.runJob(job);
      // Deliberately no sleep after a job: a queue with work in it should be
      // drained as fast as the box allows.
    }

    this.running = false;
    this.logger.info({}, 'import_worker_stopped');
  }

  get isRunning(): boolean {
    return this.running;
  }
}
