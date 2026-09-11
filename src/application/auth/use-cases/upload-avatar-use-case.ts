import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, ValidationFailure, type Failure } from '@core/failure';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { AvatarUploaderInterface } from '@application/auth/ports/avatar-uploader-interface';
import { UserMapper } from '@application/auth/mappers/user.mapper';
import type { UserDto } from '@application/auth/dtos/user.dto';

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
    private readonly authRepo: AuthRepositoryInterface,
    private readonly avatarUploader: AvatarUploaderInterface,
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
