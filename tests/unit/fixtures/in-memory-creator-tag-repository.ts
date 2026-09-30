import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, type Failure } from '@core/failure';
import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorHandle } from '@domain/users/creator-handle';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';

/**
 * Creator claims held in memory, keyed by user id. A user must be `seed`ed
 * first (an unknown id is NotFound, as for a deleted account in Prisma), and
 * `save` enforces one approved holder per handle like the partial unique index.
 */
export class InMemoryCreatorTagRepository implements CreatorTagRepositoryInterface {
  readonly tags = new Map<string, CreatorTag | null>();
  saves = 0;

  seed(userId: string, tag: CreatorTag | null = null): this {
    this.tags.set(userId, tag);
    return this;
  }

  async findByUserId(userId: string): Promise<Result<CreatorTag | null, Failure>> {
    if (!this.tags.has(userId)) return fail(new NotFoundFailure('errors.not_found.user'));
    return ok(this.tags.get(userId) ?? null);
  }

  async save(userId: string, tag: CreatorTag | null): Promise<Result<void, Failure>> {
    if (!this.tags.has(userId)) return fail(new NotFoundFailure('errors.not_found.user'));
    if (tag?.isApproved === true && this.approvedHolder(tag.account, userId)) {
      return fail(new ConflictFailure('errors.conflict.creator_handle_taken'));
    }
    this.saves += 1;
    this.tags.set(userId, tag);
    return ok(undefined);
  }

  async isHandleApprovedForAnotherUser(handle: CreatorHandle, exceptUserId: string): Promise<Result<boolean, Failure>> {
    return ok(this.approvedHolder(handle, exceptUserId));
  }

  private approvedHolder(handle: CreatorHandle, exceptUserId: string): boolean {
    return [...this.tags].some(
      ([id, tag]) => id !== exceptUserId && tag !== null && tag.isApproved && tag.account.equals(handle),
    );
  }
}
