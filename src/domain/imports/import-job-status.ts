/**
 * Where a queued import currently is.
 *
 * @remarks
 * - **Written down once.** These four words appear in the table, in the claim
 *   query, in the API response and in the worker. A string literal repeated
 *   across a boundary is a typo waiting to become a job nobody ever claims,
 *   because a `WHERE status = 'queud'` does not fail — it returns no rows.
 * - **The values are the stored ones.** `status` is a plain column, so the
 *   value here is what is written; renaming a member without a migration
 *   silently orphans every existing row.
 */
export const ImportJobStatus = {
  /** Waiting for a worker. The only state `claimNext` will hand out. */
  Queued: 'queued',
  /** A worker holds it. Reclaimable once the lease expires. */
  Running: 'running',
  /** Finished; `draftId` points at what it produced. */
  Done: 'done',
  /** Finished without a draft; `errorKey` says why, in the client's words. */
  Failed: 'failed',
} as const;

export type ImportJobStatus = (typeof ImportJobStatus)[keyof typeof ImportJobStatus];

export const IMPORT_JOB_STATUS_VALUES: readonly ImportJobStatus[] = [
  ImportJobStatus.Queued,
  ImportJobStatus.Running,
  ImportJobStatus.Done,
  ImportJobStatus.Failed,
];

const IMPORT_JOB_STATUS_SET: ReadonlySet<string> = new Set(IMPORT_JOB_STATUS_VALUES);

export const isImportJobStatus = (v: unknown): v is ImportJobStatus =>
  typeof v === 'string' && IMPORT_JOB_STATUS_SET.has(v);

/** True once the job will never move again, whichever way it ended. */
export const isTerminalImportJobStatus = (status: ImportJobStatus): boolean =>
  status === ImportJobStatus.Done || status === ImportJobStatus.Failed;
