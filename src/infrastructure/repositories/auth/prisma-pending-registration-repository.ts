import type { PrismaClient } from '@prisma/client';
import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type {
  IPendingRegistrationRepository,
  PendingRegistrationData,
  UpsertPendingRegistrationInput,
} from '@domain/auth/i-pending-registration-repository';
import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export class PrismaPendingRegistrationRepository implements IPendingRegistrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(input: UpsertPendingRegistrationInput): Promise<Result<void, Failure>> {
    try {
      await this.prisma.pendingRegistration.upsert({
        where: { email: input.email },
        create: {
          email: input.email,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          attempts: 0,
          lastCodeSentAt: new Date(),
        },
        update: {
          passwordHash: input.passwordHash,
          displayName: input.displayName,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          attempts: 0,
          lastCodeSentAt: new Date(),
        },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findByEmail(email: string): Promise<Result<PendingRegistrationData | null, Failure>> {
    try {
      const row = await this.prisma.pendingRegistration.findUnique({ where: { email } });
      if (!row) return ok(null);
      return ok({
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        displayName: row.displayName,
        codeHash: row.codeHash,
        expiresAt: row.expiresAt,
        attempts: row.attempts,
        createdAt: row.createdAt,
        lastCodeSentAt: row.lastCodeSentAt,
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async incrementAttempts(id: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.pendingRegistration.update({
        where: { id },
        data: { attempts: { increment: 1 } },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async deleteByEmail(email: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.pendingRegistration.deleteMany({ where: { email } });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async deleteExpired(): Promise<Result<void, Failure>> {
    try {
      await this.prisma.pendingRegistration.deleteMany({
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
