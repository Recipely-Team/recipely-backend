import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ImportJob } from '@domain/imports/import-job';

export interface ClaimNextImportJobInput {
  /** Identifies the claiming worker, so a stuck job says which box is holding it. */
  readonly workerId: string;
  /** How long a claim is honoured before another worker may take the job. */
  readonly leaseMs: number;
  /** Claims after which a job is abandoned rather than handed out again. */
  readonly maxAttempts: number;
  readonly now: Date;
}

export interface FailExhaustedImportJobsInput {
  readonly maxAttempts: number;
  readonly leaseMs: number;
  readonly now: Date;
  /** Machine key stored on each reaped job; the client picks the wording. */
  readonly errorKey: string;
}

export interface ImportJobRepositoryInterface {
  create(job: ImportJob): Promise<Result<ImportJob, Failure>>;
  getById(id: string): Promise<Result<ImportJob, Failure>>;

  /**
   * How many of this owner's jobs have not finished yet.
   *
   * The queue is FIFO, so an owner with an unbounded number of queued jobs is a
   * denial of service against every other owner by construction. This is what
   * the cap is measured against.
   */
  countInFlightByOwner(ownerId: string): Promise<Result<number, Failure>>;

  /**
   * How many jobs are still waiting ahead of this one.
   *
   * FIFO by `createdAt`, which is the order {@link claimNext} takes them in —
   * counting by any other rule would tell the user a position the queue does
   * not honour. Only `queued` rows count: a job already claimed by a worker is
   * not something the caller is waiting BEHIND, it is work in progress.
   */
  countQueuedAhead(job: ImportJob): Promise<Result<number, Failure>>;

  /**
   * Takes one runnable job and marks it running, atomically.
   *
   * Returns `null` when there is nothing to do — an empty queue is the normal
   * case, not a failure, and a worker polling an empty queue must not log an
   * error every second.
   *
   * The implementation is what makes two workers safe against each other; see
   * the note on the Prisma implementation for why it cannot be a read followed
   * by a write.
   */
  claimNext(input: ClaimNextImportJobInput): Promise<Result<ImportJob | null, Failure>>;

  /** Persists a transition produced by the entity. */
  save(job: ImportJob): Promise<Result<ImportJob, Failure>>;

  /**
   * Ends jobs that have used up their attempts, and returns which they were.
   *
   * The rows come back rather than a count because each owner is owed a
   * notification: a job that silently stops being claimable leaves the user's
   * screen saying "importing" forever, which is worse than a stated failure.
   */
  failExhausted(input: FailExhaustedImportJobsInput): Promise<Result<ImportJob[], Failure>>;
}
