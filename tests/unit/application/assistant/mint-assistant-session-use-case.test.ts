import { MintAssistantSessionUseCase } from '@application/assistant/use-cases/mint-assistant-session-use-case';
import { ServiceUnavailableFailure } from '@core/failure';
import type { AssistantDailyUsage, IAssistantUsageRepository } from '@domain/assistant/i-assistant-usage-repository';
import type { ILiveSessionMinter, MintLiveSessionRequest } from '@application/assistant/ports/i-live-session-minter';

const LIMITS = { userDailySeconds: 600, globalDailySeconds: 36000 };

function usageStub(usage: AssistantDailyUsage) {
  const charges: { seconds: number; newSession: boolean }[] = [];
  const repo: IAssistantUsageRepository = {
    readToday: async () => ({ ok: true, value: usage }),
    charge: async (_userId, _day, seconds, countsAsNewSession) => {
      charges.push({ seconds, newSession: countsAsNewSession });
      return { ok: true, value: { ...usage, userSeconds: usage.userSeconds + seconds } };
    },
  };
  return { repo, charges };
}

function minterStub() {
  const requests: MintLiveSessionRequest[] = [];
  const minter: ILiveSessionMinter = {
    mint: async (request) => {
      requests.push(request);
      return {
        ok: true,
        value: { token: 'auth_tokens/abc', model: 'models/live', wsUrl: 'wss://x', expiresAt: 'later' },
      };
    },
  };
  return { minter, requests };
}

describe('MintAssistantSessionUseCase', () => {
  it('mints a session and reports the remaining budget', async () => {
    const { repo } = usageStub({ userSeconds: 120, globalSeconds: 500 });
    const { minter } = minterStub();

    const result = await new MintAssistantSessionUseCase(repo, minter, LIMITS).execute({
      userId: 'u1',
      languageCode: 'tr-TR',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBe('auth_tokens/abc');
    expect(result.value.budgetRemainingSec).toBe(480);
    expect(result.value.reason).toBeUndefined();
  });

  // Running out is the expected outcome several times a day and the app answers
  // it by offering the text mode. Returned as a Failure, every refusal would
  // have surfaced as an error dialog for something working as designed.
  it('refuses an exhausted user with a success, not a failure', async () => {
    const { repo } = usageStub({ userSeconds: 600, globalSeconds: 500 });
    const { minter, requests } = minterStub();

    const result = await new MintAssistantSessionUseCase(repo, minter, LIMITS).execute({
      userId: 'u1',
      languageCode: 'tr-TR',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toBeUndefined();
    expect(result.value.budgetRemainingSec).toBe(0);
    expect(result.value.reason).toBe('user_daily_limit');
    // No token is minted for a session that may not start — the mint is a
    // billable call to Google, not a formality.
    expect(requests).toEqual([]);
  });

  // Everyone shares one free-tier key, so a busy afternoon can close voice for
  // a user who has spent nothing. "Come back tomorrow" is the wrong advice for
  // one of these two, which is why the reason is distinguished.
  it('distinguishes the app-wide cap from the user\'s own', async () => {
    const { repo } = usageStub({ userSeconds: 60, globalSeconds: 36000 });
    const { minter, requests } = minterStub();

    const result = await new MintAssistantSessionUseCase(repo, minter, LIMITS).execute({
      userId: 'u1',
      languageCode: 'tr-TR',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reason).toBe('global_daily_limit');
    expect(result.value.budgetRemainingSec).toBe(540);
    expect(requests).toEqual([]);
  });

  // A client killed mid-conversation never reports its seconds. A budget that
  // only charged completed sessions could be spent forever by crashing.
  it('counts the session at mint time', async () => {
    const { repo, charges } = usageStub({ userSeconds: 0, globalSeconds: 0 });
    const { minter } = minterStub();

    await new MintAssistantSessionUseCase(repo, minter, LIMITS).execute({
      userId: 'u1',
      languageCode: 'tr-TR',
    });

    expect(charges).toEqual([{ seconds: 0, newSession: true }]);
  });

  // The handle cannot travel on the socket — the client's setup frame is
  // discarded — so continuing a dropped session means minting with it.
  it('passes the resumption handle to the mint', async () => {
    const { repo } = usageStub({ userSeconds: 0, globalSeconds: 0 });
    const { minter, requests } = minterStub();

    await new MintAssistantSessionUseCase(repo, minter, LIMITS).execute({
      userId: 'u1',
      languageCode: 'en-US',
      resumptionHandle: 'h-9',
    });

    expect(requests).toEqual([{ languageCode: 'en-US', resumptionHandle: 'h-9' }]);
  });

  it('does not charge a session it could not mint', async () => {
    const { repo, charges } = usageStub({ userSeconds: 0, globalSeconds: 0 });
    const minter: ILiveSessionMinter = {
      mint: async () => ({ ok: false, failure: new ServiceUnavailableFailure('errors.assistant.session_unavailable') }),
    };

    const result = await new MintAssistantSessionUseCase(repo, minter, LIMITS).execute({
      userId: 'u1',
      languageCode: 'tr-TR',
    });

    expect(result.ok).toBe(false);
    expect(charges).toEqual([]);
  });
});
