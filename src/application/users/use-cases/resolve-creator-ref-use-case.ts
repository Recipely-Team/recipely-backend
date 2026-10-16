import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import { CreatorHandle } from '@domain/users/creator-handle';
import { CreatorPlatform } from '@domain/users/creator-platform';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The user a creator address names: a user id as before, or an approved
 * Instagram handle — `recipely.net/creators/recipelyapp`.
 *
 * @remarks
 * - **Only an approved handle resolves.** A claimed or rejected one is anyone's
 *   to type; the public address is the handle Recipely checked.
 * - **The id keeps working**, so every link already shared still opens.
 * - **Anything else is "no such user"**, never a validation error: a reader
 *   following a dead link wants the not-found page, not a form message.
 */
export class ResolveCreatorRefUseCase {
  constructor(private readonly tags: CreatorTagRepositoryInterface) {}

  async execute(ref: string): Promise<Result<string, Failure>> {
    if (UUID.test(ref)) return ok(ref.toLowerCase());
    const handle = CreatorHandle.create(CreatorPlatform.Instagram, ref);
    if (!handle.ok) return fail(new NotFoundFailure('errors.not_found.user'));
    const owner = await this.tags.findApprovedOwner(handle.value);
    if (!owner.ok) return owner;
    return owner.value === null ? fail(new NotFoundFailure('errors.not_found.user')) : ok(owner.value);
  }
}
