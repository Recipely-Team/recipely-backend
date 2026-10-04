import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, ValidationFailure } from '@core/failure';
import { CreatorHandle } from '@domain/users/creator-handle';
import { isCreatorPlatform, type CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus, isCreatorStatus } from '@domain/users/creator-status';

interface CreatorTagProps {
  readonly handle: CreatorHandle;
  readonly status: CreatorStatus;
  readonly requestedAt: Date;
  readonly reviewedAt: Date | null;
}

/** The raw columns of a `creator_tags` row. */
export interface CreatorTagSnapshot {
  readonly status: string;
  readonly platform: string;
  readonly handle: string;
  readonly requestedAt: Date;
  readonly reviewedAt: Date | null;
}

/**
 * **A user's claim to one social account**, and the review it went through.
 *
 * @remarks
 * - Value object of the `User` aggregate, at most one per platform: a user may
 *   hold an Instagram and a TikTok tag at once, each with its own status.
 *   Identified by (user, platform), replaced whole on every change; "no claim
 *   on this platform" is the absence of an instance.
 * - `request` holds the one rule that is easy to get wrong: re-sending the
 *   approved handle is a no-op, while any change goes back to `Pending` so a
 *   tag nobody reviewed never shows.
 * - `approve` / `reject` only move a pending claim.
 */
export class CreatorTag {
  private constructor(private readonly props: CreatorTagProps) {}

  /** `current` is the user's claim on the same platform, if any. */
  static request(handle: CreatorHandle, now: Date, current: CreatorTag | null): CreatorTag {
    if (current !== null && current.isApproved && current.props.handle.equals(handle)) return current;
    return new CreatorTag({ handle, status: CreatorStatus.Pending, requestedAt: now, reviewedAt: null });
  }

  /**
   * A claim proven by signing in to the platform itself (Business Login for
   * Instagram): approved at once, with no admin review to wait for.
   */
  static verified(handle: CreatorHandle, now: Date): CreatorTag {
    return new CreatorTag({ handle, status: CreatorStatus.Approved, requestedAt: now, reviewedAt: now });
  }

  /** Rebuilds a claim from its stored row, re-validating status, platform and handle. */
  static restore(snapshot: CreatorTagSnapshot): Result<CreatorTag, ValidationFailure> {
    const { platform, requestedAt } = snapshot;
    if (!isCreatorStatus(snapshot.status) || !isCreatorPlatform(platform)) {
      return fail(new ValidationFailure('errors.validation.creator_handle', 'status'));
    }
    const handle = CreatorHandle.create(platform, snapshot.handle);
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
  get status(): CreatorStatus { return this.props.status; }
  get requestedAt(): Date { return this.props.requestedAt; }
  get reviewedAt(): Date | null { return this.props.reviewedAt; }
  get isApproved(): boolean { return this.props.status === CreatorStatus.Approved; }
  get isPending(): boolean { return this.props.status === CreatorStatus.Pending; }

  private review(status: CreatorStatus, now: Date): Result<CreatorTag, ConflictFailure> {
    if (!this.isPending) return fail(new ConflictFailure('errors.conflict.creator_not_pending'));
    return ok(new CreatorTag({ ...this.props, status, reviewedAt: now }));
  }
}
