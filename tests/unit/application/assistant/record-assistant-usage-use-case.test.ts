import { RecordAssistantUsageUseCase } from '@application/assistant/use-cases/record-assistant-usage-use-case';
import { startOfUtcDay } from '@application/assistant/start-of-utc-day';
import type { AssistantUsageRepositoryInterface } from '@domain/assistant/assistant-usage-repository-interface';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import { UNLIMITED_BUDGET_SECONDS } from '@application/assistant/unlimited-budget';

/** Only `findRoleById` is reached from here; see the mint use case's tests. */
function authStub(role: string | null) {
  return { findRoleById: async () => ({ ok: true, value: role }) } as unknown as AuthRepositoryInterface;
}

const AS_USER = authStub('user');
const AS_ADMIN = authStub('admin');

function usageSpy(startingSeconds = 0) {
  const charges: { day: Date; seconds: number; newSession: boolean }[] = [];
  let total = startingSeconds;
  const repo: AssistantUsageRepositoryInterface = {
    readToday: async () => ({ ok: true, value: { userSeconds: total, globalSeconds: total } }),
    charge: async (_userId, day, seconds, countsAsNewSession) => {
      charges.push({ day, seconds, newSession: countsAsNewSession });
      total += seconds;
      return { ok: true, value: { userSeconds: total, globalSeconds: total } };
    },
  };
  return { repo, charges };
}

describe('RecordAssistantUsageUseCase', () => {
  it('charges the reported seconds and answers what is left', async () => {
    const { repo, charges } = usageSpy(100);

    const result = await new RecordAssistantUsageUseCase(repo, 600, AS_USER).execute({ userId: 'u1', seconds: 20 });

    expect(charges[0]?.seconds).toBe(20);
    expect(charges[0]?.newSession).toBe(false);
    expect(result.ok && result.value.budgetRemainingSec).toBe(480);
  });

  // The number comes from a device. A client that reports a year of seconds
  // must not be able to lock its own account out for the day.
  it('caps a single report', async () => {
    const { repo, charges } = usageSpy();

    await new RecordAssistantUsageUseCase(repo, 600, AS_USER).execute({ userId: 'u1', seconds: 31_536_000 });

    expect(charges[0]?.seconds).toBe(120);
  });

  it('rejects a duration that was never one', async () => {
    const { repo, charges } = usageSpy();
    const useCase = new RecordAssistantUsageUseCase(repo, 600, AS_USER);

    expect((await useCase.execute({ userId: 'u1', seconds: -5 })).ok).toBe(false);
    expect((await useCase.execute({ userId: 'u1', seconds: Number.NaN })).ok).toBe(false);
    expect((await useCase.execute({ userId: 'u1', seconds: Number.POSITIVE_INFINITY })).ok).toBe(false);
    expect(charges).toEqual([]);
  });

  it('never reports a negative remainder once the allowance is gone', async () => {
    const { repo } = usageSpy(590);

    const result = await new RecordAssistantUsageUseCase(repo, 600, AS_USER).execute({ userId: 'u1', seconds: 60 });

    expect(result.ok && result.value.budgetRemainingSec).toBe(0);
  });

  // Mirrors the mint: a session admitted without a limit must not be closed by
  // one fifteen seconds later, which is what the client does the moment this
  // answer reaches zero.
  it('never runs an admin down', async () => {
    const { repo, charges } = usageSpy(100_000);

    const result = await new RecordAssistantUsageUseCase(repo, 600, AS_ADMIN).execute({
      userId: 'u1',
      seconds: 20,
    });

    expect(result.ok && result.value.unlimited).toBe(true);
    expect(result.ok && result.value.budgetRemainingSec).toBe(UNLIMITED_BUDGET_SECONDS);
    // Still charged: the global total is read from these rows, and a session
    // left out of them makes the shared key look quieter than it is.
    expect(charges[0]?.seconds).toBe(20);
  });

  it('charges against the UTC day', async () => {
    const { repo, charges } = usageSpy();

    await new RecordAssistantUsageUseCase(repo, 600, AS_USER).execute({ userId: 'u1', seconds: 5 });

    expect(charges[0]?.day).toEqual(startOfUtcDay(new Date()));
  });
});

describe('startOfUtcDay', () => {
  // Prisma's @db.Date keeps only the date part, so a time component left on
  // would let two writes on the same day land on different keys.
  it('zeroes the time', () => {
    expect(startOfUtcDay(new Date('2026-08-20T23:59:59.999Z')).toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });

  // The user's own midnight would need their timezone, and the only place it
  // could come from is the client — which would let an app reset its own
  // allowance by lying about where it is.
  it('does not follow the local timezone', () => {
    expect(startOfUtcDay(new Date('2026-08-20T00:30:00.000Z')).toISOString()).toBe('2026-08-20T00:00:00.000Z');
    expect(startOfUtcDay(new Date('2026-08-20T22:30:00.000Z')).toISOString()).toBe('2026-08-20T00:00:00.000Z');
  });
});
