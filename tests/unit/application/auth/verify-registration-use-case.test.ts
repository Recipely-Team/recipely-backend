import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { User } from '@domain/auth/user';
import type { IAuthRepository, CreateUserInput } from '@domain/auth/i-auth-repository';
import type {
  IPendingRegistrationRepository,
  PendingRegistrationData,
} from '@domain/auth/i-pending-registration-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { ITokenSigner, TokenPayload } from '@application/auth/ports/i-token-signer';
import {
  VerifyRegistrationUseCase,
  type VerifyRegistrationInput,
} from '@application/auth/use-cases/verify-registration-use-case';

// ---- constants ---------------------------------------------------------------

const EMAIL = 'user@example.com';
const TOKEN = 'jwt-token';
const PENDING_PASSWORD_HASH = 'pending-password-hash';
const PENDING_CODE_HASH = 'pending-code-hash';
const DISPLAY_NAME = 'Jane Cook';
const USER_ID = 'user-uuid';

// ---- helpers -----------------------------------------------------------------

function makeInput(overrides: Partial<VerifyRegistrationInput> = {}): VerifyRegistrationInput {
  return { email: EMAIL, code: '123456', ...overrides };
}

function makeUser(): User {
  const emailResult = Email.create(EMAIL);
  if (!emailResult.ok) throw new Error('fixture email invalid');
  const result = User.create({
    id: USER_ID,
    email: emailResult.value,
    displayName: DISPLAY_NAME,
    photoUrl: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  });
  if (!result.ok) throw new Error('fixture user invalid');
  return result.value;
}

function makePending(overrides: Partial<PendingRegistrationData> = {}): PendingRegistrationData {
  return {
    id: 'pending-uuid',
    email: EMAIL,
    passwordHash: PENDING_PASSWORD_HASH,
    displayName: DISPLAY_NAME,
    codeHash: PENDING_CODE_HASH,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeHasher(verifyResult = true): IPasswordHasher {
  return {
    hash: jest.fn(async () => 'HASHED'),
    verify: jest.fn(async () => verifyResult),
  };
}

function makeTokens(): ITokenSigner {
  return {
    sign: jest.fn<Promise<string>, [TokenPayload]>(async () => TOKEN),
    verify: jest.fn(),
  };
}

function makeAuthRepo(options: { exists?: Result<boolean, Failure>; createUser?: Result<User, Failure> } = {}): IAuthRepository {
  const exists: Result<boolean, Failure> = options.exists ?? ok(false);
  const created: Result<User, Failure> = options.createUser ?? ok(makeUser());
  return {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(async () => exists),
    createUser: jest.fn<Promise<Result<User, Failure>>, [CreateUserInput]>(async () => created),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
  };
}

function makePendingRepo(
  options: { findByEmail?: Result<PendingRegistrationData | null, Failure> } = {},
): IPendingRegistrationRepository {
  const found: Result<PendingRegistrationData | null, Failure> =
    options.findByEmail ?? ok(makePending());
  return {
    upsert: jest.fn(),
    findByEmail: jest.fn(async () => found),
    incrementAttempts: jest.fn(async () => ok(undefined)),
    deleteByEmail: jest.fn(async () => ok(undefined)),
    deleteExpired: jest.fn(),
  };
}

// ---- tests -------------------------------------------------------------------

describe('VerifyRegistrationUseCase — happy path', () => {
  it('returns ok with a token and the created user', async () => {
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBe(TOKEN);
    expect(result.value.user.email).toBe(EMAIL);
  });

  it('creates the user from the pending passwordHash and displayName', async () => {
    const authRepo = makeAuthRepo();
    const useCase = new VerifyRegistrationUseCase(
      authRepo,
      makePendingRepo(),
      makeHasher(true),
      makeTokens(),
    );

    await useCase.execute(makeInput());

    const arg = (authRepo.createUser as jest.Mock).mock.calls[0][0] as CreateUserInput;
    expect(arg.passwordHash).toBe(PENDING_PASSWORD_HASH);
    expect(arg.displayName).toBe(DISPLAY_NAME);
  });

  it('deletes the pending registration after creating the user', async () => {
    const pendingRepo = makePendingRepo();
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(true),
      makeTokens(),
    );

    await useCase.execute(makeInput());

    expect(pendingRepo.deleteByEmail).toHaveBeenCalledWith(EMAIL);
  });

  it('signs a token for the created user', async () => {
    const tokens = makeTokens();
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(true),
      tokens,
    );

    await useCase.execute(makeInput());

    expect(tokens.sign).toHaveBeenCalledWith({ sub: USER_ID, email: EMAIL });
  });
});

describe('VerifyRegistrationUseCase — no pending registration', () => {
  it('returns a NotFoundFailure when no pending registration exists', async () => {
    const pendingRepo = makePendingRepo({ findByEmail: ok(null) });
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
    expect(result.failure.messageKey).toBe('errors.not_found.pending_registration');
  });
});

describe('VerifyRegistrationUseCase — code expired', () => {
  it('returns a ValidationFailure when the code has expired', async () => {
    const pendingRepo = makePendingRepo({
      findByEmail: ok(makePending({ expiresAt: new Date(Date.now() - 1000) })),
    });
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.code_expired');
  });
});

describe('VerifyRegistrationUseCase — too many attempts', () => {
  it('returns a ValidationFailure when attempts have reached the limit', async () => {
    const pendingRepo = makePendingRepo({ findByEmail: ok(makePending({ attempts: 5 })) });
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.code_attempts_exceeded');
  });
});

describe('VerifyRegistrationUseCase — wrong code', () => {
  it('returns a ValidationFailure when the code does not match', async () => {
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(false),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.code_invalid');
  });

  it('increments the attempt counter once on a wrong code', async () => {
    const pendingRepo = makePendingRepo();
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(false),
      makeTokens(),
    );

    await useCase.execute(makeInput());

    expect(pendingRepo.incrementAttempts).toHaveBeenCalledTimes(1);
    expect(pendingRepo.incrementAttempts).toHaveBeenCalledWith('pending-uuid');
  });

  it('does not create a user on a wrong code', async () => {
    const authRepo = makeAuthRepo();
    const useCase = new VerifyRegistrationUseCase(
      authRepo,
      makePendingRepo(),
      makeHasher(false),
      makeTokens(),
    );

    await useCase.execute(makeInput());

    expect(authRepo.createUser).not.toHaveBeenCalled();
  });
});

describe('VerifyRegistrationUseCase — race with an existing user', () => {
  it('returns a ConflictFailure when the user already exists after a valid code', async () => {
    const authRepo = makeAuthRepo({ exists: ok(true) });
    const useCase = new VerifyRegistrationUseCase(
      authRepo,
      makePendingRepo(),
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('conflict');
    expect(result.failure.messageKey).toBe('errors.conflict.email_exists');
  });

  it('does not create a user when one already exists (race)', async () => {
    const authRepo = makeAuthRepo({ exists: ok(true) });
    const useCase = new VerifyRegistrationUseCase(
      authRepo,
      makePendingRepo(),
      makeHasher(true),
      makeTokens(),
    );

    await useCase.execute(makeInput());

    expect(authRepo.createUser).not.toHaveBeenCalled();
  });
});

describe('VerifyRegistrationUseCase — invalid email input', () => {
  it('returns a validation failure when the email is malformed', async () => {
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput({ email: 'not-an-email' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });
});

describe('VerifyRegistrationUseCase — repository failures', () => {
  it('propagates the failure when findByEmail fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const pendingRepo = makePendingRepo({ findByEmail: fail(repoFailure) });
    const useCase = new VerifyRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });

  it('propagates the failure when createUser fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const authRepo = makeAuthRepo({ createUser: fail(repoFailure) });
    const useCase = new VerifyRegistrationUseCase(
      authRepo,
      makePendingRepo(),
      makeHasher(true),
      makeTokens(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
