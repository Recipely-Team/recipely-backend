import { ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { UserDto } from '@application/auth/dtos/auth.dto';

export interface UpdateMyProfileInput {
  readonly userId: string;
  readonly displayName?: string;
  readonly bio?: string;
}

export class UpdateMyProfileUseCase {
  constructor(private readonly authRepo: IAuthRepository) {}

  async execute(input: UpdateMyProfileInput): Promise<Result<UserDto, Failure>> {
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
