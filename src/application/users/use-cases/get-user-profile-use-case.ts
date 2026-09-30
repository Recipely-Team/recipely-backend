import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { UserProfileRepositoryInterface } from '@application/users/ports/user-profile-repository-interface';
import type { UserProfileDto } from '@application/users/dtos/user-profile.dto';
import { UserProfileMapper } from '@application/users/mappers/user-profile.mapper';

export interface GetUserProfileInput {
  readonly userId: string;
  readonly currentUserId?: string;
}

export class GetUserProfileUseCase {
  constructor(private readonly userProfileRepo: UserProfileRepositoryInterface) {}

  async execute(input: GetUserProfileInput): Promise<Result<UserProfileDto, Failure>> {
    const result = await this.userProfileRepo.getProfile(
      input.userId,
      ...(input.currentUserId !== undefined ? [input.currentUserId] : []),
    );
    if (!result.ok) return result;

    return ok(UserProfileMapper.toDto(result.value));
  }
}
