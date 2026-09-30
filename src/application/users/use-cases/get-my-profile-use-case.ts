import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { UserProfileRepositoryInterface } from '@application/users/ports/user-profile-repository-interface';
import type { MyProfileDto } from '@application/users/dtos/my-profile.dto';
import { UserProfileMapper } from '@application/users/mappers/user-profile.mapper';

/**
 * **`GET /me`** — the caller's own profile, with their creator claim in
 * whatever status it is (the public profile shows only an approved one).
 */
export class GetMyProfileUseCase {
  constructor(private readonly userProfileRepo: UserProfileRepositoryInterface) {}

  async execute(userId: string): Promise<Result<MyProfileDto, Failure>> {
    const result = await this.userProfileRepo.getProfile(userId, userId);
    if (!result.ok) return result;
    return ok(UserProfileMapper.toMyDto(result.value));
  }
}
