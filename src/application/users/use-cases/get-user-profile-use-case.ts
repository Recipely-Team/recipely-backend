import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IUserProfileRepository } from '@application/users/ports/i-user-profile-repository';
import type { UserProfileDto } from '@application/users/dtos/user-profile.dto';

export interface GetUserProfileInput {
  readonly userId: string;
}

export class GetUserProfileUseCase {
  constructor(private readonly userProfileRepo: IUserProfileRepository) {}

  async execute(input: GetUserProfileInput): Promise<Result<UserProfileDto, Failure>> {
    const result = await this.userProfileRepo.getProfile(input.userId);
    if (!result.ok) return result;

    const data = result.value;
    return ok({
      id: data.id,
      displayName: data.displayName,
      photoUrl: data.photoUrl,
      recipeCount: data.recipeCount,
      totalLikes: data.totalLikes,
      totalViews: data.totalViews,
      joinedAt: data.joinedAt.toISOString(),
    });
  }
}
