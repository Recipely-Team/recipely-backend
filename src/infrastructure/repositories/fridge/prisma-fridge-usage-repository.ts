import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { FridgeUsageRepositoryInterface } from '@domain/fridge/fridge-usage-repository-interface';

/**
 * The fridge day counter.
 *
 * @remarks
 * `upsert` with `increment`, never read-then-write: two calls sent at once
 * must not both read the same count and both pass the cap.
 */
export class PrismaFridgeUsageRepository implements FridgeUsageRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async consume(userId: string, day: Date): Promise<Result<number, Failure>> {
    try {
      const row = await this.prisma.fridgeUsage.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, count: 1 },
        update: { count: { increment: 1 } },
      });
      return ok(row.count);
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'fridge usage write failed'));
    }
  }

  async refund(userId: string, day: Date): Promise<void> {
    // Best effort: a lost refund costs the user one attempt, never an error page.
    await this.prisma.fridgeUsage
      .updateMany({ where: { userId, day, count: { gt: 0 } }, data: { count: { decrement: 1 } } })
      .catch(() => undefined);
  }
}
