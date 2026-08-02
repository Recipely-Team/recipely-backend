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
  readonly createdAt: string;
  readonly updatedAt: string;
}
