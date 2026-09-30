import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import { CREATORS_PAGE_SIZE } from '@domain/common/creators-page-size';
import type { UserProfileRepositoryInterface } from '@application/users/ports/user-profile-repository-interface';
import type { CreatorListItemDto } from '@application/users/dtos/creator-list-item.dto';


export interface ListCreatorsInput {
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * **`GET /users/creators`** — the Explore "Creators" strip.
 *
 * @remarks
 * - `pageSize` defaults to 20 and is capped at 50 here, not rejected: a client
 *   asking for more simply gets the cap.
 * - Who qualifies and the order are the repository's (`listCreators`).
 */
export class ListCreatorsUseCase {
  constructor(private readonly userProfileRepo: UserProfileRepositoryInterface) {}

  async execute(input: ListCreatorsInput): Promise<Result<PageResult<CreatorListItemDto>, Failure>> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(CREATORS_PAGE_SIZE.max, Math.max(1, input.pageSize ?? CREATORS_PAGE_SIZE.default));
    const result = await this.userProfileRepo.listCreators(page, pageSize);
    if (!result.ok) return result;
    return ok({
      ...result.value,
      items: result.value.items.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        photoUrl: item.photoUrl,
        creator: { platform: item.platform, handle: item.handle },
        recipeCount: item.recipeCount,
        followerCount: item.followerCount,
      })),
    });
  }
}
