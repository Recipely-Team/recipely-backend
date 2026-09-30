import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Email } from '@domain/common/email';
import { UserRole } from '@domain/auth/user-role';
import type {
  OfficialAccountRepositoryInterface,
  OfficialAccountSnapshot,
} from '@application/users/ports/official-account-repository-interface';

const UNIQUE_VIOLATION = 'P2002';

/**
 * **The official account's row in `users`.**
 *
 * @remarks
 * - Reads are scoped to `deletedAt: null`, as every read of `users` is.
 * - Created with `passwordHash: null`: the login path answers a null hash as
 *   "no such credentials", so the account cannot sign in with a password.
 */
export class PrismaOfficialAccountRepository implements OfficialAccountRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: Email): Promise<Result<OfficialAccountSnapshot | null, Failure>> {
    try {
      const row = await this.prisma.user.findFirst({
        where: { email: email.value, deletedAt: null },
        select: { id: true, role: true },
      });
      return ok(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async createOfficial(email: Email, displayName: string): Promise<Result<string, Failure>> {
    try {
      const row = await this.prisma.user.create({
        data: { email: email.value, passwordHash: null, displayName, role: UserRole.Official },
        select: { id: true },
      });
      return ok(row.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return fail(new ConflictFailure('errors.conflict.email_exists'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
