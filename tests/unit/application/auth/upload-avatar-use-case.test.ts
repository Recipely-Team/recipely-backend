import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { User } from '@domain/auth/user';
import { Email } from '@domain/common/email';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type { IAvatarUploader } from '@application/auth/ports/i-avatar-uploader';
import { UploadAvatarUseCase, type UploadAvatarInput } from '@application/auth/use-cases/upload-avatar-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const UPLOADED_URL = '/uploads/avatars/user-uuid.webp';
const FIVE_MB = 5 * 1024 * 1024;

function makeUser(photoUrl: string | null = UPLOADED_URL): User {
  const emailResult = Email.create('ada@example.com');
  if (!emailResult.ok) throw new Error('fixture email invalid');
  const result = User.create({
    id: USER_ID,
    email: emailResult.value,
    displayName: 'Ada Lovelace',
    photoUrl,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });
  if (!result.ok) throw new Error('fixture user invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeInput(overrides: Partial<UploadAvatarInput> = {}): UploadAvatarInput {
  return {
    userId: USER_ID,
    fileBuffer: Buffer.from('image-bytes'),
    mimetype: 'image/jpeg',
    fileSizeBytes: 1024,
    ...overrides,
  };
}

// ---- mocks ------------------------------------------------------------------

function makeUploader(
  behavior: { throws?: unknown } = {},
): { uploader: IAvatarUploader; uploadCalls: () => Array<{ mimetype: string; userId: string }> } {
  const uploadCalls: Array<{ mimetype: string; userId: string }> = [];
  const uploader: IAvatarUploader = {
    async upload(_fileBuffer, mimetype, userId): Promise<string> {
      uploadCalls.push({ mimetype, userId });
      if (behavior.throws !== undefined) throw behavior.throws;
      return UPLOADED_URL;
    },
  };
  return { uploader, uploadCalls: () => uploadCalls };
}

interface AuthRepoOptions {
  updateAvatarResult?: Result<User, Failure>;
}

function makeAuthRepo(options: AuthRepoOptions = {}): {
  authRepo: IAuthRepository;
  updateAvatarCalls: () => Array<{ userId: string; photoUrl: string }>;
} {
  const updateAvatarCalls: Array<{ userId: string; photoUrl: string }> = [];

  const authRepo: IAuthRepository = {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),

    async updateAvatar(userId, photoUrl): Promise<Result<User, Failure>> {
      updateAvatarCalls.push({ userId, photoUrl });
      return options.updateAvatarResult ?? ok(makeUser());
    },
  };

  return { authRepo, updateAvatarCalls: () => updateAvatarCalls };
}

function buildUseCase(
  uploaderBehavior: { throws?: unknown } = {},
  authRepoOptions: AuthRepoOptions = {},
) {
  const { uploader, uploadCalls } = makeUploader(uploaderBehavior);
  const { authRepo, updateAvatarCalls } = makeAuthRepo(authRepoOptions);
  const useCase = new UploadAvatarUseCase(authRepo, uploader);
  return { useCase, uploadCalls, updateAvatarCalls };
}

// ---- tests ------------------------------------------------------------------

describe('UploadAvatarUseCase — happy path', () => {
  it('returns the mapped user DTO with the new photo URL', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: USER_ID,
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      bio: null,
      photoUrl: UPLOADED_URL,
      role: 'user',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('uploads the file then persists the returned URL for the user', async () => {
    const { useCase, uploadCalls, updateAvatarCalls } = buildUseCase();

    await useCase.execute(makeInput());

    expect(uploadCalls()).toEqual([{ mimetype: 'image/jpeg', userId: USER_ID }]);
    expect(updateAvatarCalls()).toEqual([{ userId: USER_ID, photoUrl: UPLOADED_URL }]);
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts mimetype %s', async (mimetype) => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute(makeInput({ mimetype }));

    expect(result.ok).toBe(true);
  });

  it('accepts a file of exactly 5 MB', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute(makeInput({ fileSizeBytes: FIVE_MB }));

    expect(result.ok).toBe(true);
  });
});

describe('UploadAvatarUseCase — validation failures', () => {
  it('rejects a file larger than 5 MB without uploading', async () => {
    const { useCase, uploadCalls } = buildUseCase();

    const result = await useCase.execute(makeInput({ fileSizeBytes: FIVE_MB + 1 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.file_too_large');
    expect(uploadCalls()).toHaveLength(0);
  });

  it.each(['image/gif', 'application/pdf', 'text/plain', ''])(
    'rejects unsupported mimetype %s without uploading',
    async (mimetype) => {
      const { useCase, uploadCalls } = buildUseCase();

      const result = await useCase.execute(makeInput({ mimetype }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.messageKey).toBe('errors.validation.unsupported_image_type');
      expect(uploadCalls()).toHaveLength(0);
    },
  );
});

describe('UploadAvatarUseCase — uploader failures', () => {
  it('returns UnknownFailure with the error message when the uploader throws an Error', async () => {
    const { useCase, updateAvatarCalls } = buildUseCase({ throws: new Error('disk full') });

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('disk full');
    expect(updateAvatarCalls()).toHaveLength(0);
  });

  it('returns UnknownFailure with a generic message when the uploader throws a non-Error', async () => {
    const { useCase } = buildUseCase({ throws: 'boom' });

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
    expect(result.failure.messageKey).toBe('Failed to upload avatar');
  });
});

describe('UploadAvatarUseCase — repository failure', () => {
  it('propagates the failure when updateAvatar fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { useCase } = buildUseCase({}, { updateAvatarResult: fail(repoFailure) });

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
