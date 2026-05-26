import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, ValidationFailure, type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IAvatarUploader } from '@application/auth/ports/i-avatar-uploader';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { UserDto } from '@application/auth/dtos/auth.dto';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface UploadAvatarInput {
  readonly userId: string;
  readonly fileBuffer: Buffer;
  readonly mimetype: string;
  readonly fileSizeBytes: number;
}

export class UploadAvatarUseCase {
  constructor(
    private readonly authRepo: IAuthRepository,
    private readonly avatarUploader: IAvatarUploader,
  ) {}

  async execute(input: UploadAvatarInput): Promise<Result<UserDto, Failure>> {
    if (input.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return fail(new ValidationFailure('errors.validation.file_too_large', 'file'));
    }

    if (!ALLOWED_MIMETYPES.includes(input.mimetype)) {
      return fail(new ValidationFailure('errors.validation.unsupported_image_type', 'file'));
    }

    let url: string;
    try {
      url = await this.avatarUploader.upload(input.fileBuffer, input.mimetype, input.userId);
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Failed to upload avatar'));
    }

    const updateResult = await this.authRepo.updateAvatar(input.userId, url);
    if (!updateResult.ok) return updateResult;

    return ok(UserMapper.toDto(updateResult.value));
  }
}
