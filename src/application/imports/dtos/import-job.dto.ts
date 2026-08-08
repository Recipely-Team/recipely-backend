import type { ImportJobStatus } from '@domain/imports/import-job-status';

/**
 * What the app is told about a job it asked for.
 *
 * @remarks
 * Deliberately narrower than the row. `claimedBy` names a machine and
 * `attempts` counts our retries — operational detail the user cannot act on,
 * and a worker hostname is not something to hand to every client that asks.
 */
export interface ImportJobDto {
  readonly id: string;
  readonly status: ImportJobStatus;
  /** Set once the job is done; the draft the notification opens. */
  readonly draftId: string | null;
  /** Set once the job has failed; a key the client turns into a sentence. */
  readonly errorKey: string | null;
  /**
   * Where this job sits in the queue — 1 means it is next — or `null` once it
   * is no longer waiting.
   *
   * @remarks
   * Deliberately NOT on the entity. A position is a fact about the queue at the
   * moment of asking, not about the job: the same job is 4th and then 1st
   * without anything happening to it. Storing it would mean every claim rewrote
   * every other row, and the number would still be stale by the time it was
   * read. `null` for a running job is the honest answer — it is no longer
   * waiting for a turn, it is having one.
   */
  readonly queuePosition: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
