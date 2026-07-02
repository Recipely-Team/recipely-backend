import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { User } from '@domain/auth/user';
import type { IAuthRepository, CreateUserInput, UserCredentials } from '@domain/auth/i-auth-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { ITokenSigner, TokenPayload } from '@application/auth/ports/i-token-signer';
import { LoginUseCase, type LoginInput } from '@application/auth/use-cases/login-use-case';

// ---- constants ---------------------------------------------------------------

const EMAIL = 'user@example.com';
const PASSWORD_HASH = 'password-hash';
const TOKEN = 'jwt-token';
const USER_ID = 'user-uuid';
const ROLE = 'user';

// ---- helpers -----------------------------------------------------------------

function makeInput(overrides: Partial<LoginInput> = {}): LoginInput {
  return { email: EMAIL, password: 'supersecret', ...overrides };
}

function makeUser(email = EMAIL): User {
  const emailResult = Email.create(email);
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

function makeCreds(overrides: Partial<UserCredentials> = {}): UserCredentials {
  return {
    user: makeUser(),
    passwordHash: PASSWORD_HASH,
    role: ROLE,
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

function makeAuthRepo(
  options: { findCredentialsByEmail?: Result<UserCredentials | null, Failure> } = {},
): IAuthRepository {
  const creds: Result<UserCredentials | null, Failure> =
    options.findCredentialsByEmail ?? ok(makeCreds());
  return {
    findCredentialsByEmail: jest.fn<Promise<Result<UserCredentials | null, Failure>>, [Email]>(
      async () => creds,
    ),
    existsByEmail: jest.fn(),
    createUser: jest.fn<Promise<Result<User, Failure>>, [CreateUserInput]>(async () => ok(makeUser())),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
  };
}

// ---- tests -------------------------------------------------------------------

describe('LoginUseCase — happy path', () => {
  it('returns ok with a token and the mapped user', async () => {
    const useCase = new LoginUseCase(makeAuthRepo(), makeHasher(true), makeTokens());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBe(TOKEN);
    expect(result.value.user.email).toBe(EMAIL);
    expect(result.value.user.role).toBe(ROLE);
  });

  it('verifies the password against the stored hash', async () => {
    const hasher = makeHasher(true);
    const useCase = new LoginUseCase(makeAuthRepo(), hasher, makeTokens());

    await useCase.execute(makeInput({ password: 'supersecret' }));

    expect(hasher.verify).toHaveBeenCalledWith('supersecret', PASSWORD_HASH);
  });

  it('signs a token for the authenticated user', async () => {
    const tokens = makeTokens();
    const useCase = new LoginUseCase(makeAuthRepo(), makeHasher(true), tokens);

    await useCase.execute(makeInput());

    expect(tokens.sign).toHaveBeenCalledWith({ sub: USER_ID, email: EMAIL });
  });

  it('normalizes the email before looking up credentials', async () => {
    const authRepo = makeAuthRepo();
    const useCase = new LoginUseCase(authRepo, makeHasher(true), makeTokens());

    await useCase.execute(makeInput({ email: 'User@Example.COM' }));

    const arg = (authRepo.findCredentialsByEmail as jest.Mock).mock.calls[0][0] as Email;
    expect(arg.value).toBe('user@example.com');
  });
});

describe('LoginUseCase — invalid email input', () => {
  it('returns an UnauthorizedFailure (not a validation failure) when the email is malformed', async () => {
    const useCase = new LoginUseCase(makeAuthRepo(), makeHasher(true), makeTokens());

    const result = await useCase.execute(makeInput({ email: 'not-an-email' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unauthorized');
    expect(result.failure.messageKey).toBe('errors.unauthorized.invalid_credentials');
  });

  it('does not look up credentials when the email is malformed', async () => {
    const authRepo = makeAuthRepo();
    const useCase = new LoginUseCase(authRepo, makeHasher(true), makeTokens());

    await useCase.execute(makeInput({ email: 'not-an-email' }));

    expect(authRepo.findCredentialsByEmail).not.toHaveBeenCalled();
  });
});

describe('LoginUseCase — unknown email', () => {
  it('returns an UnauthorizedFailure when no credentials are found for the email', async () => {
    const authRepo = makeAuthRepo({ findCredentialsByEmail: ok(null) });
    const useCase = new LoginUseCase(authRepo, makeHasher(true), makeTokens());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unauthorized');
    expect(result.failure.messageKey).toBe('errors.unauthorized.invalid_credentials');
  });

  it('does not attempt to verify a password when no credentials are found', async () => {
    const authRepo = makeAuthRepo({ findCredentialsByEmail: ok(null) });
    const hasher = makeHasher(true);
    const useCase = new LoginUseCase(authRepo, hasher, makeTokens());

    await useCase.execute(makeInput());

    expect(hasher.verify).not.toHaveBeenCalled();
  });
});

describe('LoginUseCase — wrong password', () => {
  it('returns an UnauthorizedFailure with the same message key as unknown email (no user enumeration)', async () => {
    const useCase = new LoginUseCase(makeAuthRepo(), makeHasher(false), makeTokens());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unauthorized');
    expect(result.failure.messageKey).toBe('errors.unauthorized.invalid_credentials');
  });

  it('does not sign a token when the password is wrong', async () => {
    const tokens = makeTokens();
    const useCase = new LoginUseCase(makeAuthRepo(), makeHasher(false), tokens);

    await useCase.execute(makeInput());

    expect(tokens.sign).not.toHaveBeenCalled();
  });
});

describe('LoginUseCase — repository failures', () => {
  it('propagates the failure when findCredentialsByEmail fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const authRepo = makeAuthRepo({ findCredentialsByEmail: fail(repoFailure) });
    const useCase = new LoginUseCase(authRepo, makeHasher(true), makeTokens());

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
