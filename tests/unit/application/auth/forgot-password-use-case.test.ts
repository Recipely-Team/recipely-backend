import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { User } from '@domain/auth/user';
import type { IAuthRepository, CreateUserInput } from '@domain/auth/i-auth-repository';
import type { IPasswordResetTokenRepository } from '@domain/auth/i-password-reset-token-repository';
import type { IEmailSender, EmailMessage } from '@application/auth/ports/i-email-sender';
import type { TranslationService } from '@application/i18n/translation-service';
import {
  ForgotPasswordUseCase,
  type ForgotPasswordInput,
} from '@application/auth/use-cases/forgot-password-use-case';

// ---- constants ---------------------------------------------------------------

const EMAIL = 'user@example.com';
const USER_ID = 'user-uuid';
const APP_BASE_URL = 'https://recipely.net';

// ---- helpers -----------------------------------------------------------------

function makeInput(overrides: Partial<ForgotPasswordInput> = {}): ForgotPasswordInput {
  return { email: EMAIL, appBaseUrl: APP_BASE_URL, locale: 'en', ...overrides };
}

function makeUser(): User {
  const emailResult = Email.create(EMAIL);
  if (!emailResult.ok) throw new Error('fixture email invalid');
  const result = User.create({
    id: USER_ID,
    email: emailResult.value,
    displayName: 'Jane Cook',
    photoUrl: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  });
  if (!result.ok) throw new Error('fixture user invalid');
  return result.value;
}

function makeAuthRepo(options: { findByEmail?: Result<User | null, Failure> } = {}): IAuthRepository {
  const found: Result<User | null, Failure> = options.findByEmail ?? ok(makeUser());
  return {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    createUser: jest.fn<Promise<Result<User, Failure>>, [CreateUserInput]>(async () => ok(makeUser())),
    findById: jest.fn(),
    findByEmail: jest.fn<Promise<Result<User | null, Failure>>, [string]>(async () => found),
    findRoleById: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
  };
}

function makeTokenRepo(
  options: { create?: Result<void, Failure> } = {},
): IPasswordResetTokenRepository {
  const createResult: Result<void, Failure> = options.create ?? ok(undefined);
  return {
    create: jest.fn<Promise<Result<void, Failure>>, [string, string, Date]>(async () => createResult),
    findByToken: jest.fn(),
    markUsed: jest.fn(),
    deleteExpired: jest.fn(),
  };
}

function makeEmailSender(): IEmailSender {
  return { send: jest.fn<Promise<void>, [EmailMessage]>(async () => undefined) };
}

const makeTranslation = (): TranslationService => ({
  t: (key: string) => key,
  localeFromRequest: () => 'en',
});

// ---- tests -------------------------------------------------------------------

describe('ForgotPasswordUseCase — happy path', () => {
  it('returns ok when the user exists', async () => {
    const useCase = new ForgotPasswordUseCase(
      makeAuthRepo(),
      makeTokenRepo(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('creates a reset token for the user with a future expiry', async () => {
    const tokenRepo = makeTokenRepo();
    const before = Date.now();
    const useCase = new ForgotPasswordUseCase(
      makeAuthRepo(),
      tokenRepo,
      makeEmailSender(),
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    expect(tokenRepo.create).toHaveBeenCalledTimes(1);
    const [userId, token, expiresAt] = (tokenRepo.create as jest.Mock).mock.calls[0] as [
      string,
      string,
      Date,
    ];
    expect(userId).toBe(USER_ID);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(before);
  });

  it('sends a reset email containing the reset URL with the token', async () => {
    const emailSender = makeEmailSender();
    const useCase = new ForgotPasswordUseCase(
      makeAuthRepo(),
      makeTokenRepo(),
      emailSender,
      makeTranslation(),
    );

    await useCase.execute(makeInput());

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const message = (emailSender.send as jest.Mock).mock.calls[0][0] as EmailMessage;
    expect(message.to).toBe(EMAIL);
    expect(message.html).toContain(`${APP_BASE_URL}/reset-password?token=`);
    expect(message.text).toContain(`${APP_BASE_URL}/reset-password?token=`);
  });

  it('escapes HTML in translated strings but leaves the reset URL unescaped', async () => {
    const emailSender = makeEmailSender();
    const translation: TranslationService = {
      t: (key: string) => (key === 'auth.reset_email_intro' ? '<b>Hi & welcome</b>' : key),
      localeFromRequest: () => 'en',
    };
    const useCase = new ForgotPasswordUseCase(makeAuthRepo(), makeTokenRepo(), emailSender, translation);

    await useCase.execute(makeInput());

    const message = (emailSender.send as jest.Mock).mock.calls[0][0] as EmailMessage;
    expect(message.html).toContain('&lt;b&gt;Hi &amp; welcome&lt;/b&gt;');
    expect(message.html).not.toContain('<b>Hi & welcome</b>');
  });
});

describe('ForgotPasswordUseCase — unknown email (no enumeration)', () => {
  it('still returns ok when no user is found for the email', async () => {
    const authRepo = makeAuthRepo({ findByEmail: ok(null) });
    const useCase = new ForgotPasswordUseCase(
      authRepo,
      makeTokenRepo(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('does not create a reset token when no user is found', async () => {
    const authRepo = makeAuthRepo({ findByEmail: ok(null) });
    const tokenRepo = makeTokenRepo();
    const useCase = new ForgotPasswordUseCase(authRepo, tokenRepo, makeEmailSender(), makeTranslation());

    await useCase.execute(makeInput());

    expect(tokenRepo.create).not.toHaveBeenCalled();
  });

  it('does not send an email when no user is found', async () => {
    const authRepo = makeAuthRepo({ findByEmail: ok(null) });
    const emailSender = makeEmailSender();
    const useCase = new ForgotPasswordUseCase(authRepo, makeTokenRepo(), emailSender, makeTranslation());

    await useCase.execute(makeInput());

    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it('still returns ok when the findByEmail lookup itself fails (does not leak the DB error)', async () => {
    const authRepo = makeAuthRepo({ findByEmail: fail(new UnknownFailure('errors.db.read_failed')) });
    const useCase = new ForgotPasswordUseCase(
      authRepo,
      makeTokenRepo(),
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });
});

describe('ForgotPasswordUseCase — token creation failure is silent', () => {
  it('still returns ok when creating the token fails', async () => {
    const tokenRepo = makeTokenRepo({ create: fail(new UnknownFailure('errors.db.write_failed')) });
    const useCase = new ForgotPasswordUseCase(
      makeAuthRepo(),
      tokenRepo,
      makeEmailSender(),
      makeTranslation(),
    );

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });

  it('does not send an email when creating the token fails', async () => {
    const tokenRepo = makeTokenRepo({ create: fail(new UnknownFailure('errors.db.write_failed')) });
    const emailSender = makeEmailSender();
    const useCase = new ForgotPasswordUseCase(makeAuthRepo(), tokenRepo, emailSender, makeTranslation());

    await useCase.execute(makeInput());

    expect(emailSender.send).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordUseCase — email delivery is best-effort', () => {
  it('still returns ok when the email transport throws', async () => {
    const emailSender: IEmailSender = {
      send: jest.fn(async () => {
        throw new Error('SMTP down');
      }),
    };
    const useCase = new ForgotPasswordUseCase(makeAuthRepo(), makeTokenRepo(), emailSender, makeTranslation());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
  });
});
