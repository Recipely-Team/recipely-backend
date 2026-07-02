import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import type {
  IPasswordResetTokenRepository,
  PasswordResetTokenData,
} from '@domain/auth/i-password-reset-token-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import { ResetPasswordUseCase } from '@application/auth/use-cases/reset-password-use-case';

// ---- fixtures ----------------------------------------------------------------

const TOKEN = 'reset-token-abc';
const TOKEN_ID = 'token-uuid';
const USER_ID = 'user-uuid';
const NEW_PASSWORD = 'new-password-123';
const HASHED = 'hashed-new-password';

function makeTokenData(overrides: Partial<PasswordResetTokenData> = {}): PasswordResetTokenData {
  return {
    id: TOKEN_ID,
    userId: USER_ID,
    token: TOKEN,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ---- mocks ------------------------------------------------------------------

interface TokenRepoOptions {
  findResult?: Result<PasswordResetTokenData | null, Failure>;
  markUsedResult?: Result<void, Failure>;
}

function makeTokenRepo(options: TokenRepoOptions = {}): {
  tokenRepo: IPasswordResetTokenRepository;
  findCalls: () => string[];
  markUsedCalls: () => string[];
} {
  const findCalls: string[] = [];
  const markUsedCalls: string[] = [];

  const tokenRepo: IPasswordResetTokenRepository = {
    create: jest.fn(),
    deleteExpired: jest.fn(),

    async findByToken(token): Promise<Result<PasswordResetTokenData | null, Failure>> {
      findCalls.push(token);
      return options.findResult ?? ok(makeTokenData());
    },

    async markUsed(id): Promise<Result<void, Failure>> {
      markUsedCalls.push(id);
      return options.markUsedResult ?? ok(undefined);
    },
  };

  return { tokenRepo, findCalls: () => findCalls, markUsedCalls: () => markUsedCalls };
}

interface AuthRepoOptions {
  updatePasswordResult?: Result<void, Failure>;
}

function makeAuthRepo(options: AuthRepoOptions = {}): {
  authRepo: IAuthRepository;
  updatePasswordCalls: () => Array<{ userId: string; passwordHash: string }>;
} {
  const updatePasswordCalls: Array<{ userId: string; passwordHash: string }> = [];

  const authRepo: IAuthRepository = {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),

    async updatePassword(userId, passwordHash): Promise<Result<void, Failure>> {
      updatePasswordCalls.push({ userId, passwordHash });
      return options.updatePasswordResult ?? ok(undefined);
    },
  };

  return { authRepo, updatePasswordCalls: () => updatePasswordCalls };
}

function makeHasher(): { hasher: IPasswordHasher; hashCalls: () => string[] } {
  const hashCalls: string[] = [];
  const hasher: IPasswordHasher = {
    async hash(plain): Promise<string> {
      hashCalls.push(plain);
      return HASHED;
    },
    verify: jest.fn(),
  };
  return { hasher, hashCalls: () => hashCalls };
}

function buildUseCase(
  tokenRepoOptions: TokenRepoOptions = {},
  authRepoOptions: AuthRepoOptions = {},
) {
  const { tokenRepo, findCalls, markUsedCalls } = makeTokenRepo(tokenRepoOptions);
  const { authRepo, updatePasswordCalls } = makeAuthRepo(authRepoOptions);
  const { hasher, hashCalls } = makeHasher();
  const useCase = new ResetPasswordUseCase(authRepo, tokenRepo, hasher);
  return { useCase, findCalls, markUsedCalls, updatePasswordCalls, hashCalls };
}

// ---- tests ------------------------------------------------------------------

describe('ResetPasswordUseCase — happy path', () => {
  it('returns ok when the token is valid and unused', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(result.ok).toBe(true);
  });

  it('hashes the new password and stores it for the token owner', async () => {
    const { useCase, hashCalls, updatePasswordCalls } = buildUseCase();

    await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(hashCalls()).toEqual([NEW_PASSWORD]);
    expect(updatePasswordCalls()).toEqual([{ userId: USER_ID, passwordHash: HASHED }]);
  });

  it('marks the token used after updating the password', async () => {
    const { useCase, markUsedCalls } = buildUseCase();

    await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(markUsedCalls()).toEqual([TOKEN_ID]);
  });

  it('accepts a password of exactly 8 characters', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ token: TOKEN, newPassword: '12345678' });

    expect(result.ok).toBe(true);
  });
});

describe('ResetPasswordUseCase — password validation', () => {
  it('fails with ValidationFailure when the password is shorter than 8 chars', async () => {
    const { useCase, findCalls } = buildUseCase();

    const result = await useCase.execute({ token: TOKEN, newPassword: '1234567' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.password_too_short');
    expect(findCalls()).toHaveLength(0);
  });
});

describe('ResetPasswordUseCase — token validation', () => {
  it('propagates the failure when findByToken fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { useCase } = buildUseCase({ findResult: fail(repoFailure) });

    const result = await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });

  it('fails with NotFoundFailure when the token does not exist', async () => {
    const { useCase, updatePasswordCalls } = buildUseCase({ findResult: ok(null) });

    const result = await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(updatePasswordCalls()).toHaveLength(0);
  });

  it('fails with ValidationFailure when the token was already used', async () => {
    const { useCase, updatePasswordCalls } = buildUseCase({
      findResult: ok(makeTokenData({ usedAt: new Date('2026-01-02T00:00:00Z') })),
    });

    const result = await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.token_already_used');
    expect(updatePasswordCalls()).toHaveLength(0);
  });

  it('fails with ValidationFailure when the token is expired', async () => {
    const { useCase, updatePasswordCalls } = buildUseCase({
      findResult: ok(makeTokenData({ expiresAt: new Date(Date.now() - 1000) })),
    });

    const result = await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.token_expired');
    expect(updatePasswordCalls()).toHaveLength(0);
  });
});

describe('ResetPasswordUseCase — persistence failures', () => {
  it('propagates the failure when updatePassword fails and does not mark the token used', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { useCase, markUsedCalls } = buildUseCase({}, { updatePasswordResult: fail(repoFailure) });

    const result = await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
    expect(markUsedCalls()).toHaveLength(0);
  });

  it('still returns ok when markUsed fails (best-effort bookkeeping)', async () => {
    const { useCase } = buildUseCase({ markUsedResult: fail(new UnknownFailure('errors.db.write_failed')) });

    const result = await useCase.execute({ token: TOKEN, newPassword: NEW_PASSWORD });

    expect(result.ok).toBe(true);
  });
});
