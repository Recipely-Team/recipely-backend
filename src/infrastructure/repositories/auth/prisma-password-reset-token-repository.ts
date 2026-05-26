import type { PrismaClient } from '@prisma/client';
import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { IPasswordResetTokenRepository, PasswordResetTokenData } from '@domain/auth/i-password-reset-token-repository';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export class PrismaPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, token: string, expiresAt: Date): Promise<Result<void, Failure>> {
    try {
      await this.prisma.passwordResetToken.create({
        data: { userId, token, expiresAt },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findByToken(token: string): Promise<Result<PasswordResetTokenData | null, Failure>> {
    try {
      const row = await this.prisma.passwordResetToken.findUnique({ where: { token } });
      if (!row) return ok(null);
      return ok({
        id: row.id,
        userId: row.userId,
        token: row.token,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
        createdAt: row.createdAt,
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async markUsed(id: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.passwordResetToken.update({
        where: { id },
        data: { usedAt: new Date() },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async deleteExpired(): Promise<Result<void, Failure>> {
    try {
      await this.prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
