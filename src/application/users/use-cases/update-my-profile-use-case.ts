import { ModerationStatus } from '@domain/moderation/moderation-status';
import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { UserDto } from '@application/auth/dtos/user.dto';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import { UserMapper } from '@application/auth/mappers/user.mapper';

export interface UpdateMyProfileInput {
  readonly userId: string;
  readonly displayName?: string;
  readonly bio?: string;
}

export class UpdateMyProfileUseCase {
  constructor(
    private readonly authRepo: AuthRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
  ) {}

  async execute(input: UpdateMyProfileInput): Promise<Result<UserDto, Failure>> {
    const contentTexts = [
      ...(input.displayName !== undefined ? [input.displayName] : []),
      ...(input.bio !== undefined ? [input.bio] : []),
    ];
    for (const text of contentTexts) {
      const verdict = this.contentModerator.moderate({ text, context: 'general' });
      if (verdict.status === ModerationStatus.Rejected) {
        return { ok: false, failure: contentBlockedFailure(verdict.hit) };
      }
    }

    const result = await this.authRepo.updateProfile(input.userId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
    });
    if (!result.ok) return result;
    return ok(UserMapper.toDto(result.value));
  }
}
