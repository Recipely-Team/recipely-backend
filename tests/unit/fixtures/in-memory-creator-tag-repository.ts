import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, type Failure } from '@core/failure';
import type { CreatorTag } from '@domain/users/creator-tag';
import type { CreatorHandle } from '@domain/users/creator-handle';
import type { CreatorPlatform } from '@domain/users/creator-platform';
import type { CreatorTagRepositoryInterface, OwnedCreatorTag } from '@domain/users/creator-tag-repository-interface';

/**
 * Creator claims held in memory: per user, one per platform. A user must be
 * `seed`ed first (an unknown id is NotFound, as for a deleted account in
 * Prisma). A stored tag's id is `tagId(userId, platform)`. `saveReview` only
 * overwrites the pending claim it names, and `save` enforces one approved
 * holder per handle like the partial unique index.
 */
export class InMemoryCreatorTagRepository implements CreatorTagRepositoryInterface {
  readonly users = new Map<string, Map<CreatorPlatform, CreatorTag>>();
  saves = 0;

  static tagId(userId: string, platform: CreatorPlatform): string {
    return `${userId}:${platform}`;
  }

  seed(userId: string, ...tags: CreatorTag[]): this {
    this.users.set(userId, new Map(tags.map((tag) => [tag.platform, tag])));
    return this;
  }

  /** The user's claim on one platform, for assertions. */
  tag(userId: string, platform: CreatorPlatform): CreatorTag | null {
    return this.users.get(userId)?.get(platform) ?? null;
  }

  async findByUserId(userId: string): Promise<Result<readonly CreatorTag[], Failure>> {
    const tags = this.users.get(userId);
    if (tags === undefined) return fail(new NotFoundFailure('errors.not_found.user'));
    return ok([...tags.values()]);
  }

  async findById(tagId: string): Promise<Result<OwnedCreatorTag | null, Failure>> {
    for (const [userId, tags] of this.users) {
      for (const tag of tags.values()) {
        if (InMemoryCreatorTagRepository.tagId(userId, tag.platform) === tagId) return ok({ userId, tag });
      }
    }
    return ok(null);
  }

  async save(userId: string, tag: CreatorTag): Promise<Result<void, Failure>> {
    const tags = this.users.get(userId);
    if (tags === undefined) return fail(new NotFoundFailure('errors.not_found.user'));
    if (tag.isApproved && this.approvedHolder(tag.account, userId)) {
      return fail(new ConflictFailure('errors.conflict.creator_handle_taken'));
    }
    this.saves += 1;
    tags.set(tag.platform, tag);
    return ok(undefined);
  }

  async remove(userId: string, platform: CreatorPlatform): Promise<Result<void, Failure>> {
    const tags = this.users.get(userId);
    if (tags === undefined) return fail(new NotFoundFailure('errors.not_found.user'));
    tags.delete(platform);
    return ok(undefined);
  }

  async saveReview(userId: string, reviewed: CreatorTag): Promise<Result<void, Failure>> {
    const stored = this.tag(userId, reviewed.platform);
    if (
      stored === null ||
      !stored.isPending || !stored.account.equals(reviewed.account) ||
      stored.requestedAt.getTime() !== reviewed.requestedAt.getTime()
    ) {
      return fail(new ConflictFailure('errors.conflict.creator_not_pending'));
    }
    return this.save(userId, reviewed);
  }

  async isHandleApprovedForAnotherUser(handle: CreatorHandle, exceptUserId: string): Promise<Result<boolean, Failure>> {
    return ok(this.approvedHolder(handle, exceptUserId));
  }

  async findApprovedOwner(handle: CreatorHandle): Promise<Result<string | null, Failure>> {
    const owner = [...this.users].find(([, tags]) => [...tags.values()].some((tag) => tag.isApproved && tag.account.equals(handle)));
    return ok(owner?.[0] ?? null);
  }

  private approvedHolder(handle: CreatorHandle, exceptUserId: string): boolean {
    return [...this.users].some(
      ([id, tags]) => id !== exceptUserId && [...tags.values()].some((tag) => tag.isApproved && tag.account.equals(handle)),
    );
  }
}
