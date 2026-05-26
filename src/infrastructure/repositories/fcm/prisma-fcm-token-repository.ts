import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { IFcmTokenRepository } from '@application/notifications/ports/i-fcm-token-repository';

export class PrismaFcmTokenRepository implements IFcmTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async register(userId: string, token: string, platform: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.fcmToken.upsert({
        where: { token },
        update: { userId, platform, updatedAt: new Date() },
        create: { userId, token, platform },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getTokensForUser(userId: string): Promise<Result<string[], Failure>> {
    try {
      const rows = await this.prisma.fcmToken.findMany({
        where: { userId },
        select: { token: true },
      });
      return ok(rows.map(r => r.token));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async deleteToken(token: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.fcmToken.deleteMany({ where: { token } });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
