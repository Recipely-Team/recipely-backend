import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, ValidationFailure } from '@core/failure';
import { CreatorHandle } from '@domain/users/creator-handle';
import { isCreatorPlatform, type CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus, type ClaimedCreatorStatus } from '@domain/users/creator-status';

interface CreatorTagProps {
  readonly handle: CreatorHandle;
  readonly status: ClaimedCreatorStatus;
  readonly requestedAt: Date;
  readonly reviewedAt: Date | null;
}

/** The raw creator columns of a `users` row. */
export interface CreatorTagSnapshot {
  readonly status: string;
  readonly platform: string | null;
  readonly handle: string | null;
  readonly requestedAt: Date | null;
  readonly reviewedAt: Date | null;
}

/**
 * **A user's claim to a social account**, and the review it went through.
 *
 * @remarks
 * - Value object of the `User` aggregate: no identity of its own, replaced
 *   whole on every change. "No claim" (`CreatorStatus.None`) is `null`, never
 *   an instance, so every instance has a platform and a handle.
 * - `request` holds the one rule that is easy to get wrong: re-sending the
 *   approved handle is a no-op, while any change goes back to `Pending` so a
 *   tag nobody reviewed never shows.
 * - `approve` / `reject` only move a pending claim.
 */
export class CreatorTag {
  private constructor(private readonly props: CreatorTagProps) {}

  static request(handle: CreatorHandle, now: Date, current: CreatorTag | null): CreatorTag {
    if (current !== null && current.isApproved && current.props.handle.equals(handle)) return current;
    return new CreatorTag({ handle, status: CreatorStatus.Pending, requestedAt: now, reviewedAt: null });
  }

  /** Rebuilds a claim from stored columns; `null` when there is none. */
  static restore(snapshot: CreatorTagSnapshot): Result<CreatorTag | null, ValidationFailure> {
    if (snapshot.status === CreatorStatus.None) return ok(null);
    const { platform, handle: raw, requestedAt } = snapshot;
    if (!isClaimedStatus(snapshot.status) || !isCreatorPlatform(platform) || raw === null || requestedAt === null) {
      return fail(new ValidationFailure('errors.validation.creator_handle', 'creatorStatus'));
    }
    const handle = CreatorHandle.create(platform, raw);
    if (!handle.ok) return handle;
    return ok(new CreatorTag({ handle: handle.value, status: snapshot.status, requestedAt, reviewedAt: snapshot.reviewedAt }));
  }

  approve(now: Date): Result<CreatorTag, ConflictFailure> {
    return this.review(CreatorStatus.Approved, now);
  }

  reject(now: Date): Result<CreatorTag, ConflictFailure> {
    return this.review(CreatorStatus.Rejected, now);
  }

  /** The platform and handle together, as one value. */
  get account(): CreatorHandle { return this.props.handle; }
  get platform(): CreatorPlatform { return this.props.handle.platform; }
  get handle(): string { return this.props.handle.value; }
  get status(): ClaimedCreatorStatus { return this.props.status; }
  get requestedAt(): Date { return this.props.requestedAt; }
  get reviewedAt(): Date | null { return this.props.reviewedAt; }
  get isApproved(): boolean { return this.props.status === CreatorStatus.Approved; }
  get isPending(): boolean { return this.props.status === CreatorStatus.Pending; }

  private review(status: ClaimedCreatorStatus, now: Date): Result<CreatorTag, ConflictFailure> {
    if (!this.isPending) return fail(new ConflictFailure('errors.conflict.creator_not_pending'));
    return ok(new CreatorTag({ ...this.props, status, reviewedAt: now }));
  }
}

function isClaimedStatus(v: string): v is ClaimedCreatorStatus {
  return v === CreatorStatus.Pending || v === CreatorStatus.Approved || v === CreatorStatus.Rejected;
}
