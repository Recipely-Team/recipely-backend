import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { User } from '@domain/auth/user';
import type { IAuthRepository, CreateUserInput } from '@domain/auth/i-auth-repository';
import type {
  IPendingRegistrationRepository,
  PendingRegistrationData,
  UpsertPendingRegistrationInput,
} from '@domain/auth/i-pending-registration-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { IEmailSender, EmailMessage } from '@application/auth/ports/i-email-sender';
import type { TranslationService } from '@application/i18n/translation-service';
import {
  RequestRegistrationUseCase,
  type RequestRegistrationInput,
} from '@application/auth/use-cases/request-registration-use-case';

// ---- constants ---------------------------------------------------------------

const HASH = 'HASHED';

// ---- helpers -----------------------------------------------------------------

function makeInput(overrides: Partial<RequestRegistrationInput> = {}): RequestRegistrationInput {
  return {
    email: 'user@example.com',
    password: 'supersecret',
    displayName: 'Jane Cook',
    locale: 'en',
    ...overrides,
  };
}

/** A real User so UserMapper.toDto works wherever a use case maps the result. */
function makeUser(email = 'user@example.com', displayName = 'Jane Cook'): User {
  const emailResult = Email.create(email);
  if (!emailResult.ok) throw new Error('fixture email invalid');
  const result = User.create({
    id: 'user-uuid',
    email: emailResult.value,
    displayName,
    photoUrl: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  });
  if (!result.ok) throw new Error('fixture user invalid');
  return result.value;
}

function makeHasher(): IPasswordHasher {
  return {
    hash: jest.fn(async () => HASH),
    verify: jest.fn(async () => true),
  };
}

function makeEmailSender(): IEmailSender {
  return { send: jest.fn<Promise<void>, [EmailMessage]>(async () => undefined) };
}

const makeTranslation = (): TranslationService => ({
  t: (key: string) => key,
  localeFromRequest: () => 'en',
});

function makeAuthRepo(options: { exists?: Result<boolean, Failure> } = {}): IAuthRepository {
  const exists: Result<boolean, Failure> = options.exists ?? ok(false);
  return {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(async () => exists),
    createUser: jest.fn<Promise<Result<User, Failure>>, [CreateUserInput]>(async () =>
      ok(makeUser()),
    ),
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
  options: { upsert?: Result<void, Failure> } = {},
): IPendingRegistrationRepository {
  const upsertResult: Result<void, Failure> = options.upsert ?? ok(undefined);
  return {
    upsert: jest.fn<Promise<Result<void, Failure>>, [UpsertPendingRegistrationInput]>(
      async () => upsertResult,
    ),
    findByEmail: jest.fn<Promise<Result<PendingRegistrationData | null, Failure>>, [string]>(),
    incrementAttempts: jest.fn(),
    deleteByEmail: jest.fn(),
    deleteExpired: jest.fn(),
  };
}

// ---- tests -------------------------------------------------------------------

describe('RequestRegistrationUseCase — happy path', () => {
  it('returns ok for valid input when the email is not taken', async () => {
    const authRepo = makeAuthRepo();
    const pendingRepo = makePendingRepo();
    const useCase = new RequestRegistrationUseCase(
      authRepo,
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('returns the email, a 600-second expiry, and a 6-digit code', async () => {
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ email: 'User@Example.com' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe('user@example.com');
    expect(result.value.expiresInSeconds).toBe(600);
    expect(result.value.code).toMatch(/^\d{6}$/);
  });

  it('upserts the pending registration with a future expiry', async () => {
    const pendingRepo = makePendingRepo();
    const before = Date.now();
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    const arg = (pendingRepo.upsert as jest.Mock).mock.calls[0][0] as UpsertPendingRegistrationInput;
    expect(arg.expiresAt.getTime()).toBeGreaterThan(before);
  });

  it('trims the displayName before persisting', async () => {
    const pendingRepo = makePendingRepo();
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput({ displayName: '  Jane Cook  ' }));

    const arg = (pendingRepo.upsert as jest.Mock).mock.calls[0][0] as UpsertPendingRegistrationInput;
    expect(arg.displayName).toBe('Jane Cook');
  });

  it('sends a verification email', async () => {
    const emailSender = makeEmailSender();
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(),
      emailSender,
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });
});

describe('RequestRegistrationUseCase — secrets are hashed', () => {
  it('hashes the password (stored value is the hash, never the raw password)', async () => {
    const hasher = makeHasher();
    const pendingRepo = makePendingRepo();
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      hasher,
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput({ password: 'supersecret' }));

    const arg = (pendingRepo.upsert as jest.Mock).mock.calls[0][0] as UpsertPendingRegistrationInput;
    expect(hasher.hash).toHaveBeenCalledWith('supersecret');
    expect(arg.passwordHash).toBe(HASH);
  });

  it('hashes the verification code (stored codeHash is the hash, not the raw code)', async () => {
    const hasher = makeHasher();
    const pendingRepo = makePendingRepo();
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      hasher,
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const arg = (pendingRepo.upsert as jest.Mock).mock.calls[0][0] as UpsertPendingRegistrationInput;
    expect(arg.codeHash).toBe(HASH);
    expect(arg.codeHash).not.toBe(result.value.code);
  });
});

describe('RequestRegistrationUseCase — validation failures', () => {
  it('returns a ValidationFailure when the password is shorter than 8 characters', async () => {
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ password: '1234567' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.password_too_short');
  });

  it('returns a ValidationFailure when the displayName is blank whitespace', async () => {
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ displayName: '   ' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.display_name_required');
  });

  it('returns a validation failure when the email is malformed', async () => {
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ email: 'not-an-email' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });
});

describe('RequestRegistrationUseCase — email already registered', () => {
  it('returns a ConflictFailure when a user already exists for the email', async () => {
    const authRepo = makeAuthRepo({ exists: ok(true) });
    const useCase = new RequestRegistrationUseCase(
      authRepo,
      makePendingRepo(),
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('conflict');
    expect(result.failure.messageKey).toBe('errors.conflict.email_exists');
  });

  it('does not upsert a pending registration when the user already exists', async () => {
    const authRepo = makeAuthRepo({ exists: ok(true) });
    const pendingRepo = makePendingRepo();
    const useCase = new RequestRegistrationUseCase(
      authRepo,
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    expect(pendingRepo.upsert).not.toHaveBeenCalled();
  });
});

describe('RequestRegistrationUseCase — repository failures', () => {
  it('propagates the failure when existsByEmail fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const authRepo = makeAuthRepo({ exists: fail(repoFailure) });
    const useCase = new RequestRegistrationUseCase(
      authRepo,
      makePendingRepo(),
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });

  it('propagates the failure when the pending upsert fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const pendingRepo = makePendingRepo({ upsert: fail(repoFailure) });
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});

describe('RequestRegistrationUseCase — email delivery is best-effort', () => {
  it('still returns ok when the email transport throws', async () => {
    const emailSender: IEmailSender = {
      send: jest.fn(async () => {
        throw new Error('SMTP down');
      }),
    };
    const useCase = new RequestRegistrationUseCase(
      makeAuthRepo(),
      makePendingRepo(),
      makeHasher(),
      emailSender,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });
});
