import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Email } from '@domain/common/email';
import type { User } from '@domain/auth/user';
import type {
  CreateUserInput,
  IAuthRepository,
  UserCredentials,
} from '@domain/auth/i-auth-repository';
import { UserRowMapper } from '@infrastructure/prisma/mappers/user.row-mapper';

export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCredentialsByEmail(email: Email): Promise<Result<UserCredentials | null, Failure>> {
    try {
      const row = await this.prisma.user.findUnique({ where: { email: email.value } });
      if (!row) return ok(null);

      const userResult = UserRowMapper.toDomain(row);
      if (!userResult.ok) return userResult;

      return ok({ user: userResult.value, passwordHash: row.passwordHash, role: row.role });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async existsByEmail(email: Email): Promise<Result<boolean, Failure>> {
    try {
      const count = await this.prisma.user.count({ where: { email: email.value } });
      return ok(count > 0);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async createUser(input: CreateUserInput): Promise<Result<User, Failure>> {
    try {
      const row = await this.prisma.user.create({
        data: {
          email: input.email.value,
          passwordHash: input.passwordHash,
          displayName: input.displayName,
        },
      });
      return UserRowMapper.toDomain(row);
    } catch (err) {
      // WHY: race against existsByEmail — unique constraint violation is the canonical check.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return fail(new ConflictFailure('Email is already registered'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findById(id: string): Promise<Result<User | null, Failure>> {
    try {
      const row = await this.prisma.user.findUnique({ where: { id } });
      if (!row) return ok(null);
      const userResult = UserRowMapper.toDomain(row);
      if (!userResult.ok) return userResult;
      return ok(userResult.value);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findRoleById(id: string): Promise<Result<string | null, Failure>> {
    try {
      const row = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
      return ok(row?.role ?? null);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
