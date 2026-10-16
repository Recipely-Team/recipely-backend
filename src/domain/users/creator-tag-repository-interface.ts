import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorHandle } from '@domain/users/creator-handle';
import type { CreatorPlatform } from '@domain/users/creator-platform';

/** A stored claim together with the user it belongs to, as an admin review reads it. */
export interface OwnedCreatorTag {
  readonly userId: string;
  readonly tag: CreatorTag;
}

/**
 * Loads and stores a user's creator claims — one per platform, a slice of the
 * `User` aggregate read and written on its own because nothing else about the
 * user changes with it. Every method treats a deleted account as absent.
 */
export interface CreatorTagRepositoryInterface {
  /** The user's claims, any status (empty when none); NotFoundFailure for no live user. */
  findByUserId(userId: string): Promise<Result<readonly CreatorTag[], Failure>>;
  /** A claim by its stored id; `null` when there is none or its owner is deleted. */
  findById(tagId: string): Promise<Result<OwnedCreatorTag | null, Failure>>;
  /**
   * Creates or replaces the user's claim on `tag.platform`. NotFoundFailure for
   * no live user, and ConflictFailure `creator_handle_taken` when the store's
   * own uniqueness guard refuses a second approved holder of the handle.
   */
  save(userId: string, tag: CreatorTag): Promise<Result<void, Failure>>;
  /** Withdraws the user's claim on `platform`, if any. NotFoundFailure for no live user. */
  remove(userId: string, platform: CreatorPlatform): Promise<Result<void, Failure>>;
  /**
   * Writes an approve/reject decision, but only while the stored claim on that
   * platform is still pending on the same handle and request time as
   * `reviewed`. ConflictFailure `creator_not_pending` when the user changed or
   * withdrew it meanwhile, and `creator_handle_taken` as for `save`.
   */
  saveReview(userId: string, reviewed: CreatorTag): Promise<Result<void, Failure>>;
  /** Whether a user other than `exceptUserId` holds this handle, approved. */
  isHandleApprovedForAnotherUser(handle: CreatorHandle, exceptUserId: string): Promise<Result<boolean, Failure>>;
  /** The live user an approved handle belongs to, or `null`: a creator's public address resolves through this. */
  findApprovedOwner(handle: CreatorHandle): Promise<Result<string | null, Failure>>;
}
