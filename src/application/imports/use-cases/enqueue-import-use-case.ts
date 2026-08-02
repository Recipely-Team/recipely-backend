import { randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import { TooManyRequestsFailure, type Failure } from '@core/failure';
import { ImportJob } from '@domain/imports/import-job';
import { InstagramUrl } from '@domain/imports/instagram-url';
import type { IImportJobRepository } from '@domain/imports/i-import-job-repository';
import { ImportJobMapper } from '@application/imports/mappers/import-job.mapper';
import type { ImportJobDto } from '@application/imports/dtos/import-job.dto';

export interface EnqueueImportInput {
  readonly ownerId: string;
  readonly url: string;
  /**
   * The requester's language, captured now because it cannot be recovered
   * later: the worker runs minutes afterwards on a machine that never saw the
   * request, and a URL says nothing about who asked or in what language.
   */
  readonly locale: string;
}

/**
 * Accepts an import and hands back a receipt.
 *
 * @remarks
 * - **Why the request no longer waits.** The pipeline behind it measures
 *   59-128 s on a 1 OCPU box. Holding an HTTP request open that long is a
 *   connection doing nothing, a user staring at a spinner, and a result lost
 *   entirely if the app is backgrounded — the phone will happily kill the
 *   socket. The job outlives the request instead, and the user is told when it
 *   lands.
 * - **What this deliberately does NOT do.** It does not run the import, so it
 *   holds no AI credentials and cannot be slow. Everything expensive happens in
 *   a worker, which is why a worker box can be replaced or lost without the API
 *   noticing.
 */
export class EnqueueImportUseCase {
  constructor(
    private readonly repo: IImportJobRepository,
    /**
     * Jobs one user may have in flight at once.
     *
     * Without a cap, a script — or a tap-happy user on a slow connection —
     * queues a hundred imports and the whole fleet works through their backlog
     * while everyone else waits. The queue is FIFO, so an unbounded producer is
     * a denial of service against every other user by construction.
     */
    private readonly maxInFlightPerOwner: number,
  ) {}

  async execute(input: EnqueueImportInput): Promise<Result<ImportJobDto, Failure>> {
    const url = InstagramUrl.create(input.url);
    if (!url.ok) return url;

    const inFlight = await this.repo.countInFlightByOwner(input.ownerId);
    if (!inFlight.ok) return inFlight;
    if (inFlight.value >= this.maxInFlightPerOwner) {
      return { ok: false, failure: new TooManyRequestsFailure('errors.import.too_many_in_flight') };
    }

    const job = ImportJob.queue({
      id: randomUUID(),
      ownerId: input.ownerId,
      url: url.value.toString(),
      locale: input.locale,
      now: new Date(),
    });
    if (!job.ok) return job;

    const created = await this.repo.create(job.value);
    if (!created.ok) return created;

    return ok(ImportJobMapper.toDto(created.value));
  }
}
