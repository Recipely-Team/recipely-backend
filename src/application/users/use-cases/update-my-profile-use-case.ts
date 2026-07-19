import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { UserDto } from '@application/auth/dtos/auth.dto';
import type { IContentModerator } from '@application/moderation/ports/i-content-moderator';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';

export interface UpdateMyProfileInput {
  readonly userId: string;
  readonly displayName?: string;
  readonly bio?: string;
}

export class UpdateMyProfileUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly contentModerator: IContentModerator,
  ) {}

  async execute(input: UpdateMyProfileInput): Promise<Result<UserDto, Failure>> {
    const contentTexts = [
      ...(input.displayName !== undefined ? [input.displayName] : []),
      ...(input.bio !== undefined ? [input.bio] : []),
    ];
    for (const text of contentTexts) {
      const verdict = this.contentModerator.moderate({ text, context: 'general' });
      if (verdict.status === 'rejected') {
        return { ok: false, failure: contentBlockedFailure(verdict.hit) };
      }
    }

    const result = await this.authRepo.updateProfile(input.userId, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
    });
    if (!result.ok) return result;
    const user = result.value;
    return ok({
      id: user.id,
      email: user.email.value,
      displayName: user.displayName,
      bio: user.bio ?? null,
      photoUrl: user.photoUrl,
      role: 'user',
      createdAt: user.createdAt.toISOString(),
    });
  }
}
