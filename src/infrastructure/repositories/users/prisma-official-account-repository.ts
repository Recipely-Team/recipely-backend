import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Email } from '@domain/common/email';
import { UserRole } from '@domain/auth/user-role';
import type {
  OfficialAccountRepositoryInterface,
  OfficialAccountSnapshot,
} from '@domain/users/official-account-repository-interface';

const UNIQUE_VIOLATION = 'P2002';

/**
 * **The official account's row in `users`.**
 *
 * @remarks
 * - Reads deliberately include deleted rows — the one exception to the
 *   `deletedAt: null` rule — so a deleted official account is reported, not
 *   silently replaced (see the port).
 * - Created with `passwordHash: null`: the login path answers a null hash as
 *   "no such credentials", so the account cannot sign in with a password.
 */
export class PrismaOfficialAccountRepository implements OfficialAccountRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: Email): Promise<Result<OfficialAccountSnapshot | null, Failure>> {
    try {
      const row = await this.prisma.user.findFirst({
        where: { email: email.value },
        select: { id: true, role: true, deletedAt: true, suspendedAt: true },
      });
      return ok(row === null ? null : { id: row.id, role: row.role, deleted: row.deletedAt !== null, suspended: row.suspendedAt !== null });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async hasDeletedOfficial(): Promise<Result<boolean, Failure>> {
    try {
      const count = await this.prisma.user.count({ where: { role: UserRole.Official, deletedAt: { not: null } } });
      return ok(count > 0);
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
