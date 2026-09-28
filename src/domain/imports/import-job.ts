import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, ValidationFailure, type Failure } from '@core/failure';
import {
  ImportJobStatus,
  isTerminalImportJobStatus,
} from '@domain/imports/import-job-status';
import { ImportUrl } from '@domain/imports/import-url';
import type { SourcePlatformType } from '@domain/recipes/source-platform';

export interface ImportJobProps {
  id: string;
  ownerId: string;
  url: string;
  /** Language the recipe is extracted in and the completion push written in. */
  locale: string;
  status: ImportJobStatus;
  claimedBy: string | null;
  claimedAt: Date | null;
  attempts: number;
  draftId: string | null;
  errorKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One Instagram import, from the moment it is asked for to the moment it has a
 * draft or a reason it has none.
 *
 * @remarks
 * - **The transitions live here, not in the worker.** A worker that decided for
 *   itself when a job was finishable would be a second worker away from two of
 *   them finishing the same job — and the second one would overwrite the first
 *   one's `draftId`, so the notification would open a draft the user never saw
 *   produced. Every move is a method that refuses the moves that are not legal
 *   from where the job actually is.
 * - **Transitions return a new instance.** Nothing mutates in place, so a caller
 *   holding the pre-claim job cannot accidentally report on the post-claim one.
 * - **`attempts` counts claims, not failures.** A worker that dies mid-import
 *   never reports anything, so counting failures would let a job that kills
 *   every worker it touches be handed out forever. Counting the claim bounds it
 *   whether or not anyone lived to report back.
 */
export class ImportJob extends Entity<ImportJobProps> {
  private constructor(props: ImportJobProps) {
    super(props);
  }

  /** A brand-new job, waiting for whichever worker asks first. */
  static queue(props: {
    id: string;
    ownerId: string;
    url: string;
    locale: string;
    now: Date;
  }): Result<ImportJob, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }
    if (props.ownerId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.owner_required', 'ownerId'));
    }
    if (props.url.trim().length === 0) {
      return fail(new ValidationFailure('errors.import.invalid_url', 'url'));
    }

    return ok(
      new ImportJob({
        id: props.id,
        ownerId: props.ownerId,
        url: props.url,
        locale: props.locale,
        status: ImportJobStatus.Queued,
        claimedBy: null,
        claimedAt: null,
        attempts: 0,
        draftId: null,
        errorKey: null,
        createdAt: props.now,
        updatedAt: props.now,
      }),
    );
  }

  /**
   * Rebuilds a job from a row.
   *
   * Deliberately does not re-run the queue-time rules: a row that is already in
   * the table has to be readable even if today's rules would have rejected it,
   * or a tightened rule turns every old row into an error the user cannot clear.
   */
  static restore(props: ImportJobProps): ImportJob {
    return new ImportJob(props);
  }

  get ownerId(): string { return this.props.ownerId; }
  get url(): string { return this.props.url; }
  /**
   * Where the link points, read from the url itself. Null only for a row whose
   * url today's rules no longer accept — `restore` keeps such rows readable.
   */
  get sourcePlatform(): SourcePlatformType | null {
    const parsed = ImportUrl.create(this.props.url);
    return parsed.ok ? parsed.value.platform : null;
  }
  get locale(): string { return this.props.locale; }
  get status(): ImportJobStatus { return this.props.status; }
  get claimedBy(): string | null { return this.props.claimedBy; }
  get claimedAt(): Date | null { return this.props.claimedAt; }
  get attempts(): number { return this.props.attempts; }
  get draftId(): string | null { return this.props.draftId; }
  get errorKey(): string | null { return this.props.errorKey; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** True once the job will never move again, whichever way it ended. */
  get isFinished(): boolean {
    return isTerminalImportJobStatus(this.props.status);
  }

  /**
   * Whether a claim this old counts as abandoned.
   *
   * A worker killed mid-import reports nothing, so without a lease its row sits
   * in `running` forever and the user waits for a notification that is never
   * coming. The lease is what lets the next worker take it instead.
   */
  isLeaseExpired(now: Date, leaseMs: number): boolean {
    if (this.props.status !== ImportJobStatus.Running) return false;
    if (this.props.claimedAt === null) return true;
    return now.getTime() - this.props.claimedAt.getTime() >= leaseMs;
  }

  /** Hands the job to a worker, counting the attempt. */
  claim(workerId: string, now: Date): Result<ImportJob, ConflictFailure> {
    if (this.isFinished) {
      return fail(new ConflictFailure('errors.import.job_already_finished'));
    }
    return ok(
      new ImportJob({
        ...this.props,
        status: ImportJobStatus.Running,
        claimedBy: workerId,
        claimedAt: now,
        attempts: this.props.attempts + 1,
        updatedAt: now,
      }),
    );
  }

  /** Records the draft the import produced. */
  complete(draftId: string, now: Date): Result<ImportJob, Failure> {
    if (this.isFinished) {
      return fail(new ConflictFailure('errors.import.job_already_finished'));
    }
    if (draftId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'draftId'));
    }
    return ok(
      new ImportJob({
        ...this.props,
        status: ImportJobStatus.Done,
        draftId,
        errorKey: null,
        updatedAt: now,
      }),
    );
  }

  /**
   * Records why there is no draft.
   *
   * `errorKey` is a machine key, never a sentence: the wording belongs to the
   * client, which knows the user's language. A worker writing English here
   * would put untranslatable text in front of a Turkish user.
   */
  markFailed(errorKey: string, now: Date): Result<ImportJob, Failure> {
    if (this.isFinished) {
      return fail(new ConflictFailure('errors.import.job_already_finished'));
    }
    if (errorKey.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.required', 'errorKey'));
    }
    return ok(
      new ImportJob({
        ...this.props,
        status: ImportJobStatus.Failed,
        draftId: null,
        errorKey,
        updatedAt: now,
      }),
    );
  }

  /**
   * Puts an unfinished job back in the queue.
   *
   * Used when a claim's lease expires: the job is still worth running, it just
   * is not being run by anyone.
   */
  release(now: Date): Result<ImportJob, ConflictFailure> {
    if (this.isFinished) {
      return fail(new ConflictFailure('errors.import.job_already_finished'));
    }
    return ok(
      new ImportJob({
        ...this.props,
        status: ImportJobStatus.Queued,
        claimedBy: null,
        claimedAt: null,
        updatedAt: now,
      }),
    );
  }

  toRaw(): ImportJobProps {
    return this.props;
  }
}
