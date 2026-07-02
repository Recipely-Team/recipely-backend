import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { User } from '@domain/auth/user';
import { Email } from '@domain/common/email';
import type {
  IAuthRepository,
  FindOrCreateSocialUserInput,
  SocialUserResult,
} from '@domain/auth/i-auth-repository';
import type { ITokenSigner, TokenPayload } from '@application/auth/ports/i-token-signer';
import type {
  IFirebaseTokenVerifier,
  FirebaseTokenPayload,
} from '@application/auth/ports/i-firebase-token-verifier';
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
): { verifier: IFirebaseTokenVerifier; verifyCalls: () => string[] } {
  const verifyCalls: string[] = [];
  const verifier: IFirebaseTokenVerifier = {
    async verify(idToken): Promise<FirebaseTokenPayload> {
      verifyCalls.push(idToken);
      if (behavior.throws) throw new Error('invalid token');
      return behavior.payload ?? makeFirebasePayload();
    },
  };
  return { verifier, verifyCalls: () => verifyCalls };
}

interface AuthRepoOptions {
  socialResult?: Result<SocialUserResult, Failure>;
}

function makeAuthRepo(options: AuthRepoOptions = {}): {
  authRepo: IAuthRepository;
  socialCalls: () => FindOrCreateSocialUserInput[];
} {
  const socialCalls: FindOrCreateSocialUserInput[] = [];

  const authRepo: IAuthRepository = {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    updateAvatar: jest.fn(),
    updateProfile: jest.fn(),
    updatePassword: jest.fn(),

    async findOrCreateSocialUser(input): Promise<Result<SocialUserResult, Failure>> {
      socialCalls.push(input);
      return options.socialResult ?? ok({ user: makeUser(), role: 'user' });
    },
  };

  return { authRepo, socialCalls: () => socialCalls };
}

function makeSigner(): { tokens: ITokenSigner; signCalls: () => TokenPayload[] } {
  const signCalls: TokenPayload[] = [];
  const tokens: ITokenSigner = {
    async sign(payload): Promise<string> {
      signCalls.push(payload);
      return SIGNED_TOKEN;
    },
    verify: jest.fn(),
  };
  return { tokens, signCalls: () => signCalls };
}

function buildUseCase(
  verifierBehavior: { payload?: FirebaseTokenPayload; throws?: boolean } = {},
  authRepoOptions: AuthRepoOptions = {},
) {
  const { verifier, verifyCalls } = makeVerifier(verifierBehavior);
  const { authRepo, socialCalls } = makeAuthRepo(authRepoOptions);
  const { tokens, signCalls } = makeSigner();
  const useCase = new SocialAuthUseCase(authRepo, tokens, verifier);
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
