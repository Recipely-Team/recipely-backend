import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorHandle } from '@domain/users/creator-handle';

/**
 * Loads and stores a user's creator claim — a slice of the `User` aggregate,
 * read and written on its own because nothing else about the user changes
 * with it. Every method treats a deleted account as absent.
 */
export interface CreatorTagRepositoryInterface {
  /** The user's claim (`null` when there is none); NotFoundFailure for no live user. */
  findByUserId(userId: string): Promise<Result<CreatorTag | null, Failure>>;
  /**
   * Replaces the claim; `null` clears it. NotFoundFailure for no live user, and
   * ConflictFailure `creator_handle_taken` when the store's own uniqueness
   * guard refuses a second approved holder of the handle.
   */
  save(userId: string, tag: CreatorTag | null): Promise<Result<void, Failure>>;
  /** Whether a user other than `exceptUserId` holds this handle, approved. */
  isHandleApprovedForAnotherUser(handle: CreatorHandle, exceptUserId: string): Promise<Result<boolean, Failure>>;
}
