import { MintAssistantIntentTokenUseCase } from '@application/assistant/use-cases/mint-assistant-intent-token-use-case';
import type { IntentTokenSignerInterface } from '@application/assistant/ports/intent-token-signer-interface';

const THIRTY_DAYS_SEC = 60 * 60 * 24 * 30;

function signer(lifetimeSeconds = THIRTY_DAYS_SEC): IntentTokenSignerInterface {
  return {
    sign: jest.fn().mockResolvedValue('a-token'),
    verify: jest.fn(),
    lifetimeSeconds,
  };
}

describe('MintAssistantIntentTokenUseCase', () => {
  it('signs for the user the session proved', async () => {
    const tokens = signer();

    const result = await new MintAssistantIntentTokenUseCase(tokens).execute({
      userId: 'user-1',
      email: 'cook@example.com',
    });

    expect(result.ok).toBe(true);
    expect(tokens.sign).toHaveBeenCalledWith({ sub: 'user-1', email: 'cook@example.com' });
  });

  // The client is told an absolute instant and the token carries a duration; if
  // these were computed from two different numbers, a client would refresh either
  // too early forever or — the one that breaks the feature — too late, after the
  // only credential the OS assistant has went stale.
  it('dates the expiry from the signer\'s own lifetime', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00.000Z'));

    const result = await new MintAssistantIntentTokenUseCase(signer()).execute({
      userId: 'user-1',
      email: 'cook@example.com',
    });

    expect(result.ok && result.value.expiresAt).toBe('2026-10-10T12:00:00.000Z');

    jest.useRealTimers();
  });

  it('follows a shorter lifetime rather than a hard-coded month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00.000Z'));

    const result = await new MintAssistantIntentTokenUseCase(signer(60)).execute({
      userId: 'user-1',
      email: 'cook@example.com',
    });

    expect(result.ok && result.value.expiresAt).toBe('2026-09-10T12:01:00.000Z');

    jest.useRealTimers();
  });
});
