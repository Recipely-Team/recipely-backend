import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { IFcmTokenRepository } from '@application/notifications/ports/i-fcm-token-repository';
import {
  RegisterFcmTokenUseCase,
  type RegisterFcmTokenInput,
} from '@application/notifications/use-cases/register-fcm-token-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';
const TOKEN = 'fcm-token-abc';

interface RepoOptions {
  registerResult?: Result<void, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IFcmTokenRepository;
  registerCalls: () => Array<{ userId: string; token: string; platform: string }>;
} {
  const registerCalls: Array<{ userId: string; token: string; platform: string }> = [];

  const repo: IFcmTokenRepository = {
    getTokensForUser: jest.fn(),
    deleteToken: jest.fn(),

    async register(userId, token, platform): Promise<Result<void, Failure>> {
      registerCalls.push({ userId, token, platform });
      return options.registerResult ?? ok(undefined);
    },
  };

  return { repo, registerCalls: () => registerCalls };
}

function makeInput(overrides: Partial<RegisterFcmTokenInput> = {}): RegisterFcmTokenInput {
  return { userId: USER_ID, token: TOKEN, platform: 'ios', ...overrides };
}

// ---- tests ------------------------------------------------------------------

describe('RegisterFcmTokenUseCase — happy path', () => {
  it.each(['ios', 'android', 'web'])('registers the token for platform %s', async (platform) => {
    const { repo, registerCalls } = makeRepo();
    const useCase = new RegisterFcmTokenUseCase(repo);

    const result = await useCase.execute(makeInput({ platform }));

    expect(result.ok).toBe(true);
    expect(registerCalls()).toEqual([{ userId: USER_ID, token: TOKEN, platform }]);
  });
});

describe('RegisterFcmTokenUseCase — validation failures', () => {
  it.each(['', '   '])('rejects a blank token (%p) without hitting the repository', async (token) => {
    const { repo, registerCalls } = makeRepo();
    const useCase = new RegisterFcmTokenUseCase(repo);

    const result = await useCase.execute(makeInput({ token }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.validation.token_required');
    expect(registerCalls()).toHaveLength(0);
  });

  it.each(['windows', 'IOS', 'Android', ''])(
    'rejects invalid platform %p without hitting the repository',
    async (platform) => {
      const { repo, registerCalls } = makeRepo();
      const useCase = new RegisterFcmTokenUseCase(repo);

      const result = await useCase.execute(makeInput({ platform }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
      expect(result.failure.messageKey).toBe('errors.validation.platform_invalid');
      expect(registerCalls()).toHaveLength(0);
    },
  );
});

describe('RegisterFcmTokenUseCase — repository failure', () => {
  it('propagates the failure when register fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ registerResult: fail(repoFailure) });
    const useCase = new RegisterFcmTokenUseCase(repo);

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
