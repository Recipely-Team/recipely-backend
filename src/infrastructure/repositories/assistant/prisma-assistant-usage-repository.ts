import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  AssistantDailyUsage,
  AssistantUsageRepositoryInterface,
} from '@domain/assistant/assistant-usage-repository-interface';

/**
 * @remarks
 * - **`upsert`, not read-then-write.** Two devices signed into one account can
 *   heartbeat at the same moment, and a read-modify-write would let the later
 *   one overwrite the earlier one's seconds — the budget would leak in exactly
 *   the case it is meant to cover. `increment` makes the addition atomic.
 * - **Both totals in one transaction**, following the repository convention
 *   here: the Oracle host is small and a second round trip per heartbeat is
 *   paid on every session-second, not once.
 */
export class PrismaAssistantUsageRepository implements AssistantUsageRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async readToday(userId: string, day: Date): Promise<Result<AssistantDailyUsage, Failure>> {
    try {
      const [mine, everyone] = await this.prisma.$transaction([
        this.prisma.assistantUsage.findUnique({ where: { userId_day: { userId, day } } }),
        this.prisma.assistantUsage.aggregate({ where: { day }, _sum: { seconds: true } }),
      ]);
      return ok({
        userSeconds: mine?.seconds ?? 0,
        globalSeconds: everyone._sum.seconds ?? 0,
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async charge(
    userId: string,
    day: Date,
    seconds: number,
    countsAsNewSession: boolean,
  ): Promise<Result<AssistantDailyUsage, Failure>> {
    const sessions = countsAsNewSession ? 1 : 0;
    try {
      const [mine, everyone] = await this.prisma.$transaction([
        this.prisma.assistantUsage.upsert({
          where: { userId_day: { userId, day } },
          create: { userId, day, seconds, sessions },
          update: { seconds: { increment: seconds }, sessions: { increment: sessions } },
        }),
        this.prisma.assistantUsage.aggregate({ where: { day }, _sum: { seconds: true } }),
      ]);
      return ok({
        userSeconds: mine.seconds,
        // The aggregate runs beside the upsert in the same transaction, so it
        // may or may not observe it. Taking the larger of the two keeps the
        // global total from ever reading below this user's own contribution.
        globalSeconds: Math.max(everyone._sum.seconds ?? 0, mine.seconds),
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'assistant usage write failed';
}
