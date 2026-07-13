import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { User } from '@domain/auth/user';
import type { IAuthRepository, CreateUserInput, UserCredentials } from '@domain/auth/i-auth-repository';
import type { IPasswordHasher } from '@application/auth/ports/i-password-hasher';
import type { ITokenSigner, TokenPayload } from '@application/auth/ports/i-token-signer';
import { LoginUseCase } from '@application/auth/use-cases/login-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { createTestTranslationService } from '../../../helpers/translation';

/**
 * Login is an UNAUTHENTICATED endpoint, so the caller has proved nothing about who
 * they are. Once the app renders distinct copy per `messageKey`, any key that
 * varies with the state of the account behind an arbitrary email turns login into
 * an account-enumeration oracle.
 *
 * Every rejection below must therefore be byte-for-byte identical: a soft-deleted
 * account must be indistinguishable from an address that never registered.
 */

const ts = createTestTranslationService();
const translate = (key: string, locale?: string): string => ts.t(key, locale);

function makeUser(): User {
  const email = Email.create('user@example.com');
  if (!email.ok) throw new Error('fixture email invalid');
  const user = User.create({
    id: 'user-uuid',
    email: email.value,
    displayName: 'Jane Cook',
    photoUrl: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  });
  if (!user.ok) throw new Error('fixture user invalid');
  return user.value;
}

function makeRepo(creds: Result<UserCredentials | null, Failure>): IAuthRepository {
  return {
    findCredentialsByEmail: jest.fn(async () => creds),
    existsByEmail: jest.fn(),
    createUser: jest.fn<Promise<Result<User, Failure>>, [CreateUserInput]>(async () => ok(makeUser())),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
    deleteAccount: jest.fn(),
    isActive: jest.fn(),
  } as unknown as IAuthRepository;
}

function makeHasher(verifyResult: boolean): IPasswordHasher {
  return { hash: jest.fn(async () => 'HASHED'), verify: jest.fn(async () => verifyResult) };
}

function makeTokens(): ITokenSigner {
  return { sign: jest.fn<Promise<string>, [TokenPayload]>(async () => 'jwt'), verify: jest.fn() };
}

async function rejectionFor(scenario: 'unknown-email' | 'wrong-password' | 'soft-deleted') {
  // A soft-deleted user is tombstoned, and every `users` read filters on
  // `deletedAt: null` — so the repository reports it exactly as it reports an
  // address that was never registered: as `null`.
  const creds =
    scenario === 'wrong-password'
      ? ok({ user: makeUser(), passwordHash: 'hash', role: 'user' })
      : ok(null);

  const useCase = new LoginUseCase(
    makeRepo(creds as Result<UserCredentials | null, Failure>),
    makeHasher(scenario !== 'wrong-password'),
    makeTokens(),
  );

  const result = await useCase.execute({ email: 'user@example.com', password: 'supersecret' });
  if (result.ok) throw new Error(`expected ${scenario} to fail`);
  return failureToHttp(result.failure, translate, 'en');
}

describe('LoginUseCase — does not leak account existence', () => {
  it('answers identically whether the email is unknown, the password is wrong, or the account was deleted', async () => {
    const unknownEmail = await rejectionFor('unknown-email');
    const wrongPassword = await rejectionFor('wrong-password');
    const softDeleted = await rejectionFor('soft-deleted');

    expect(unknownEmail).toEqual(wrongPassword);
    expect(softDeleted).toEqual(wrongPassword);

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.error.messageKey).toBe('errors.unauthorized.invalid_credentials');
    expect(wrongPassword.body.error.message).toBe('Email or password is incorrect.');
  });

  it('never tells an unauthenticated caller that an account was deleted', async () => {
    for (const scenario of ['unknown-email', 'wrong-password', 'soft-deleted'] as const) {
      const { body } = await rejectionFor(scenario);
      // `errors.unauthorized.account_deleted` is legitimate — but only on an
      // authenticated path (the EnsureAccountActive tombstone check), where the
      // caller already proved the account is theirs.
      expect(body.error.messageKey).not.toBe('errors.unauthorized.account_deleted');
      expect(body.error.messageKey).not.toBe('errors.unauthorized.user_not_found');
      expect(body.error.messageKey).not.toBe('errors.not_found.user');
    }
  });

  it('rejects a malformed email with the same key, so the format check is not an oracle either', async () => {
    const useCase = new LoginUseCase(makeRepo(ok(null)), makeHasher(false), makeTokens());

    const result = await useCase.execute({ email: 'not-an-email', password: 'x' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.unauthorized.invalid_credentials');
  });
});
