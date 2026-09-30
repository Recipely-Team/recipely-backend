import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { User } from '@domain/auth/user';
import { Email } from '@domain/common/email';
import type {
  AuthRepositoryInterface,
  FindOrCreateSocialUserInput,
  SocialUserResult,
} from '@domain/auth/auth-repository-interface';
import type { TokenSignerInterface, TokenPayload } from '@application/auth/ports/token-signer-interface';
import type {
  FirebaseTokenVerifierInterface,
  FirebaseTokenPayload,
} from '@application/auth/ports/firebase-token-verifier-interface';
import type { DeviceRepositoryInterface, RecordLoginInput } from '@application/devices/ports/device-repository-interface';
import { SocialAuthUseCase } from '@application/auth/use-cases/social-auth-use-case';

// ---- fixtures ----------------------------------------------------------------

const ID_TOKEN = 'firebase-id-token';
const USER_ID = 'user-uuid';
const SIGNED_TOKEN = 'signed-jwt';

function makeUser(email = 'ada@example.com'): User {
  const emailResult = Email.create(email);
  if (!emailResult.ok) throw new Error('fixture email invalid');
  const result = User.create({
    id: USER_ID,
    email: emailResult.value,
    displayName: 'Ada Lovelace',
    photoUrl: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });
  if (!result.ok) throw new Error('fixture user invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeFirebasePayload(overrides: Partial<FirebaseTokenPayload> = {}): FirebaseTokenPayload {
  return {
    uid: 'firebase-uid',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    picture: 'https://example.com/pic.jpg',
    signInProvider: 'google.com',
    ...overrides,
  };
}

// ---- mocks ------------------------------------------------------------------

function makeVerifier(
  behavior: { payload?: FirebaseTokenPayload; throws?: boolean } = {},
): { verifier: FirebaseTokenVerifierInterface; verifyCalls: () => string[] } {
  const verifyCalls: string[] = [];
  const verifier: FirebaseTokenVerifierInterface = {
    async verify(idToken): Promise<FirebaseTokenPayload> {
      verifyCalls.push(idToken);
      if (behavior.throws) throw new Error('invalid token');
      return behavior.payload ?? makeFirebasePayload();
    },
  };
  return { verifier, verifyCalls: () => verifyCalls };
}

interface AuthRepoOptions {
  accountStatus?: { deletedAt: Date | null; suspendedAt: Date | null; role?: string };
  socialResult?: Result<SocialUserResult, Failure>;
}

function makeAuthRepo(options: AuthRepoOptions = {}): {
  authRepo: AuthRepositoryInterface;
  socialCalls: () => FindOrCreateSocialUserInput[];
} {
  const socialCalls: FindOrCreateSocialUserInput[] = [];

  const authRepo: AuthRepositoryInterface = {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),
    deleteAccount: jest.fn(),
    isActive: jest.fn(),
    getAccountStatus: jest.fn(async () => ok({ deletedAt: null, suspendedAt: null, role: 'user', ...options.accountStatus })),
    suspendUser: jest.fn(),
    unsuspendUser: jest.fn(),

    async findOrCreateSocialUser(input): Promise<Result<SocialUserResult, Failure>> {
      socialCalls.push(input);
      return options.socialResult ?? ok({ user: makeUser(), role: 'user' });
    },
  };

  return { authRepo, socialCalls: () => socialCalls };
}

function makeSigner(): { tokens: TokenSignerInterface; signCalls: () => TokenPayload[] } {
  const signCalls: TokenPayload[] = [];
  const tokens: TokenSignerInterface = {
    async sign(payload): Promise<string> {
      signCalls.push(payload);
      return SIGNED_TOKEN;
    },
    verify: jest.fn(),
  };
  return { tokens, signCalls: () => signCalls };
}

function makeDeviceRepo(
  options: { recordLoginResult?: Result<void, Failure> } = {},
): { devices: DeviceRepositoryInterface; recordLoginCalls: () => RecordLoginInput[] } {
  const recordLoginCalls: RecordLoginInput[] = [];
  const devices: DeviceRepositoryInterface = {
    async recordLogin(input): Promise<Result<void, Failure>> {
      recordLoginCalls.push(input);
      return options.recordLoginResult ?? ok(undefined);
    },
    listForUser: jest.fn(),
  };
  return { devices, recordLoginCalls: () => recordLoginCalls };
}

const DEVICE_CONTEXT = { deviceId: 'device-1', platform: 'android', ip: '1.2.3.4' };

function buildUseCase(
  verifierBehavior: { payload?: FirebaseTokenPayload; throws?: boolean } = {},
  authRepoOptions: AuthRepoOptions = {},
  devices: DeviceRepositoryInterface | null = null,
) {
  const { verifier, verifyCalls } = makeVerifier(verifierBehavior);
  const { authRepo, socialCalls } = makeAuthRepo(authRepoOptions);
  const { tokens, signCalls } = makeSigner();
  const useCase = new SocialAuthUseCase(authRepo, tokens, verifier, devices);
  return { useCase, verifyCalls, socialCalls, signCalls };
}

// ---- tests ------------------------------------------------------------------

describe('SocialAuthUseCase — happy path', () => {
  it('returns a session DTO with the signed token and mapped user', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ idToken: ID_TOKEN });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBe(SIGNED_TOKEN);
    expect(result.value.user).toEqual({
      id: USER_ID,
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      bio: null,
      photoUrl: null,
      role: 'user',
      createdAt: '2024-01-01T00:00:00.000Z',
      creator: null,
    });
  });

  it('verifies the Firebase token and signs a JWT for the resolved user', async () => {
    const { useCase, verifyCalls, signCalls } = buildUseCase();

    await useCase.execute({ idToken: ID_TOKEN });

    expect(verifyCalls()).toEqual([ID_TOKEN]);
    expect(signCalls()).toEqual([{ sub: USER_ID, email: 'ada@example.com' }]);
  });

  it('forwards email, display name, and picture to findOrCreateSocialUser', async () => {
    const { useCase, socialCalls } = buildUseCase();

    await useCase.execute({ idToken: ID_TOKEN });

    expect(socialCalls()).toHaveLength(1);
    const input = socialCalls()[0]!;
    expect(input.email.value).toBe('ada@example.com');
    expect(input.displayName).toBe('Ada Lovelace');
    expect(input.photoUrl).toBe('https://example.com/pic.jpg');
  });

  it('returns the role reported by the repository', async () => {
    const { useCase } = buildUseCase({}, { socialResult: ok({ user: makeUser(), role: 'admin' }) });

    const result = await useCase.execute({ idToken: ID_TOKEN });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.user.role).toBe('admin');
  });
});

describe('SocialAuthUseCase — display name fallback', () => {
  it('falls back to the email local part when the token has no name', async () => {
    const { useCase, socialCalls } = buildUseCase({
      payload: makeFirebasePayload({ name: undefined }),
    });

    await useCase.execute({ idToken: ID_TOKEN });

    expect(socialCalls()[0]!.displayName).toBe('ada');
  });

  it('falls back to the email local part when the name is blank', async () => {
    const { useCase, socialCalls } = buildUseCase({
      payload: makeFirebasePayload({ name: '   ' }),
    });

    await useCase.execute({ idToken: ID_TOKEN });

    expect(socialCalls()[0]!.displayName).toBe('ada');
  });

  it('passes null photoUrl when the token has no picture', async () => {
    const { useCase, socialCalls } = buildUseCase({
      payload: makeFirebasePayload({ picture: undefined }),
    });

    await useCase.execute({ idToken: ID_TOKEN });

    expect(socialCalls()[0]!.photoUrl).toBeNull();
  });
});

describe('SocialAuthUseCase — suspended account', () => {
  it('rejects with the suspended key rather than signing a token', async () => {
    const { useCase } = buildUseCase({}, {
      accountStatus: { deletedAt: null, suspendedAt: new Date('2026-08-29T00:00:00Z') },
    });

    const result = await useCase.execute({ idToken: ID_TOKEN });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.unauthorized.account_suspended');
  });
});

describe('SocialAuthUseCase — unauthorized paths', () => {
  it('fails with UnauthorizedFailure when the Firebase verifier throws', async () => {
    const { useCase, socialCalls } = buildUseCase({ throws: true });

    const result = await useCase.execute({ idToken: 'bad-token' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unauthorized');
    expect(result.failure.messageKey).toBe('errors.unauthorized.invalid_firebase_token');
    expect(socialCalls()).toHaveLength(0);
  });

  it('fails with UnauthorizedFailure when the token carries no email', async () => {
    const { useCase, socialCalls } = buildUseCase({
      payload: makeFirebasePayload({ email: undefined }),
    });

    const result = await useCase.execute({ idToken: ID_TOKEN });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unauthorized');
    expect(result.failure.messageKey).toBe('errors.unauthorized.no_email_in_token');
    expect(socialCalls()).toHaveLength(0);
  });

  it('fails with UnauthorizedFailure when the token email is invalid', async () => {
    const { useCase, socialCalls } = buildUseCase({
      payload: makeFirebasePayload({ email: 'not-an-email' }),
    });

    const result = await useCase.execute({ idToken: ID_TOKEN });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unauthorized');
    expect(result.failure.messageKey).toBe('errors.unauthorized.invalid_email_in_token');
    expect(socialCalls()).toHaveLength(0);
  });
});

describe('SocialAuthUseCase — repository failure', () => {
  it('propagates the failure when findOrCreateSocialUser fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { useCase, signCalls } = buildUseCase({}, { socialResult: fail(repoFailure) });

    const result = await useCase.execute({ idToken: ID_TOKEN });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
    expect(signCalls()).toHaveLength(0);
  });
});

describe('SocialAuthUseCase — device tracking', () => {
  it('records the device when device context is present and a repo is injected', async () => {
    const { devices, recordLoginCalls } = makeDeviceRepo();
    const { useCase } = buildUseCase({}, {}, devices);

    await useCase.execute({ idToken: ID_TOKEN, device: DEVICE_CONTEXT });

    expect(recordLoginCalls()).toEqual([{ userId: USER_ID, ...DEVICE_CONTEXT }]);
  });

  it('does not record a device when the input has no device context', async () => {
    const { devices, recordLoginCalls } = makeDeviceRepo();
    const { useCase } = buildUseCase({}, {}, devices);

    await useCase.execute({ idToken: ID_TOKEN });

    expect(recordLoginCalls()).toHaveLength(0);
  });

  it('does not record a device when no repository is injected (back-compat default)', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ idToken: ID_TOKEN, device: DEVICE_CONTEXT });

    expect(result.ok).toBe(true);
  });

  it('still returns a successful login when recordLogin fails', async () => {
    const { devices } = makeDeviceRepo({ recordLoginResult: fail(new UnknownFailure('errors.db.write_failed')) });
    const { useCase } = buildUseCase({}, {}, devices);

    const result = await useCase.execute({ idToken: ID_TOKEN, device: DEVICE_CONTEXT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBe(SIGNED_TOKEN);
  });

  it('still returns a successful login when recordLogin rejects', async () => {
  const rejecting: DeviceRepositoryInterface = {
      recordLogin: () => Promise.reject(new Error('device store unreachable')),
      listForUser: jest.fn(),
    };

    const { useCase } = buildUseCase({}, {}, rejecting);

    const result = await useCase.execute({ idToken: ID_TOKEN, device: DEVICE_CONTEXT });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBe(SIGNED_TOKEN);
  });

  it('does not record a device on a failed login (invalid Firebase token)', async () => {
    const { devices, recordLoginCalls } = makeDeviceRepo();
    const { useCase } = buildUseCase({ throws: true }, {}, devices);

    await useCase.execute({ idToken: 'bad-token', device: DEVICE_CONTEXT });

    expect(recordLoginCalls()).toHaveLength(0);
  });
});

/**
 * Anyone holding a Google or Apple account on the official address would
 * otherwise be signed straight in as "Recipely Mutfağı": social sign-in finds
 * the existing row by email. Every Firebase provider goes through this path.
 */
describe('SocialAuthUseCase — official account', () => {
  it.each(['google.com', 'apple.com', 'password', 'facebook.com'])('refuses a %s sign-in as the official account', async (signInProvider) => {
    const { useCase, signCalls } = buildUseCase(
      { payload: makeFirebasePayload({ email: 'mutfak@recipely.net', signInProvider }) },
      { accountStatus: { deletedAt: null, suspendedAt: null, role: 'official' }, socialResult: ok({ user: makeUser(), role: 'official' }) },
    );

    const result = await useCase.execute({ idToken: ID_TOKEN });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.messageKey).toBe('errors.unauthorized.account_cannot_sign_in');
    expect(signCalls()).toHaveLength(0);
  });
});
