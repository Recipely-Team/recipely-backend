import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  IPendingRegistrationRepository,
  PendingRegistrationData,
  UpsertPendingRegistrationInput,
} from '@domain/auth/i-pending-registration-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { IEmailSender, EmailMessage } from '@application/auth/ports/i-email-sender';
import type { TranslationService } from '@application/i18n/translation-service';
import { RESEND_COOLDOWN_MS } from '@application/auth/use-cases/request-registration-use-case';
import {
  ResendRegistrationCodeUseCase,
  type ResendRegistrationCodeInput,
} from '@application/auth/use-cases/resend-registration-code-use-case';

// ---- constants ---------------------------------------------------------------

const EMAIL = 'user@example.com';
const NEW_CODE_HASH = 'new-code-hash';
const PENDING_PASSWORD_HASH = 'pending-password-hash';
const DISPLAY_NAME = 'Jane Cook';

// ---- helpers -----------------------------------------------------------------

function makeInput(overrides: Partial<ResendRegistrationCodeInput> = {}): ResendRegistrationCodeInput {
  return { email: EMAIL, locale: 'en', ...overrides };
}

function makePending(overrides: Partial<PendingRegistrationData> = {}): PendingRegistrationData {
  return {
    id: 'pending-uuid',
    email: EMAIL,
    passwordHash: PENDING_PASSWORD_HASH,
    displayName: DISPLAY_NAME,
    codeHash: 'old-code-hash',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 3,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    // Default well outside the cooldown window so the common case proceeds.
    lastCodeSentAt: new Date(Date.now() - 60_000),
    ...overrides,
  };
}

function makeHasher(): IPasswordHasher {
  return {
    hash: jest.fn(async () => NEW_CODE_HASH),
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

function makePendingRepo(
  options: {
    findByEmail?: Result<PendingRegistrationData | null, Failure>;
    upsert?: Result<void, Failure>;
  } = {},
): IPendingRegistrationRepository {
  const found: Result<PendingRegistrationData | null, Failure> =
    options.findByEmail ?? ok(makePending());
  const upsertResult: Result<void, Failure> = options.upsert ?? ok(undefined);
  return {
    upsert: jest.fn<Promise<Result<void, Failure>>, [UpsertPendingRegistrationInput]>(
      async () => upsertResult,
    ),
    findByEmail: jest.fn(async () => found),
    incrementAttempts: jest.fn(),
    deleteByEmail: jest.fn(),
    deleteExpired: jest.fn(),
  };
}

// ---- tests -------------------------------------------------------------------

describe('ResendRegistrationCodeUseCase — no pending registration', () => {
  it('returns ok with found:false when no pending registration exists', async () => {
    const pendingRepo = makePendingRepo({ findByEmail: ok(null) });
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ found: false });
  });

  it('does not send an email or upsert when there is no pending registration', async () => {
    const pendingRepo = makePendingRepo({ findByEmail: ok(null) });
    const emailSender = makeEmailSender();
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      emailSender,
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(pendingRepo.upsert).not.toHaveBeenCalled();
  });
});

describe('ResendRegistrationCodeUseCase — invalid email', () => {
  it('returns ok with found:false for a malformed email (no information leak)', async () => {
    const pendingRepo = makePendingRepo();
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput({ email: 'not-an-email' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ found: false });
  });

  it('does not query the repository for a malformed email', async () => {
    const pendingRepo = makePendingRepo();
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput({ email: 'not-an-email' }));

    expect(pendingRepo.findByEmail).not.toHaveBeenCalled();
  });
});

describe('ResendRegistrationCodeUseCase — pending registration exists', () => {
  it('returns ok with found:true, a 600-second expiry, and a 6-digit code', async () => {
    const useCase = new ResendRegistrationCodeUseCase(
      makePendingRepo(),
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (!result.value.found) throw new Error('expected found:true');
    expect(result.value.expiresInSeconds).toBe(600);
    expect(result.value.code).toMatch(/^\d{6}$/);
  });

  it('upserts with a freshly hashed code', async () => {
    const pendingRepo = makePendingRepo();
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    const arg = (pendingRepo.upsert as jest.Mock).mock.calls[0][0] as UpsertPendingRegistrationInput;
    expect(arg.codeHash).toBe(NEW_CODE_HASH);
  });

  it('reuses the stored passwordHash and displayName (does not re-hash a password)', async () => {
    const pendingRepo = makePendingRepo();
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    const arg = (pendingRepo.upsert as jest.Mock).mock.calls[0][0] as UpsertPendingRegistrationInput;
    expect(arg.passwordHash).toBe(PENDING_PASSWORD_HASH);
    expect(arg.displayName).toBe(DISPLAY_NAME);
  });

  it('sends a verification email', async () => {
    const emailSender = makeEmailSender();
    const useCase = new ResendRegistrationCodeUseCase(
      makePendingRepo(),
      makeHasher(),
      emailSender,
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('still returns ok when the email transport throws (best-effort send)', async () => {
    const emailSender: IEmailSender = {
      send: jest.fn(async () => {
        throw new Error('SMTP down');
      }),
    };
    const useCase = new ResendRegistrationCodeUseCase(
      makePendingRepo(),
      makeHasher(),
      emailSender,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });
});

describe('ResendRegistrationCodeUseCase — resend cooldown', () => {
  it('returns TooManyRequestsFailure when a code was sent within the cooldown window', async () => {
    const pendingRepo = makePendingRepo({
      findByEmail: ok(makePending({ lastCodeSentAt: new Date(Date.now() - 5 * 1000) })),
    });
    const emailSender = makeEmailSender();
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      emailSender,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('too_many_requests');
    expect(result.failure.messageKey).toBe('errors.too_many_requests.code_cooldown');
    expect(emailSender.send).not.toHaveBeenCalled();
    expect(pendingRepo.upsert).not.toHaveBeenCalled();
  });

  it('resends when the prior code was sent before the cooldown window', async () => {
    const pendingRepo = makePendingRepo({
      findByEmail: ok(
        makePending({ lastCodeSentAt: new Date(Date.now() - RESEND_COOLDOWN_MS - 1000) }),
      ),
    });
    const emailSender = makeEmailSender();
    const useCase = new ResendRegistrationCodeUseCase(
      pendingRepo,
      makeHasher(),
      emailSender,
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.found).toBe(true);
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });
});

describe('ResendRegistrationCodeUseCase — repository failures', () => {
  it('propagates the failure when findByEmail fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const pendingRepo = makePendingRepo({ findByEmail: fail(repoFailure) });
    const useCase = new ResendRegistrationCodeUseCase(
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

  it('propagates the failure when the upsert fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const pendingRepo = makePendingRepo({ upsert: fail(repoFailure) });
    const useCase = new ResendRegistrationCodeUseCase(
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
