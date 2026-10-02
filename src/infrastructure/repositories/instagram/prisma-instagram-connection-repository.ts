import { Prisma, type InstagramConnection as ConnectionRow, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, UnknownFailure, type Failure } from '@core/failure';
import { InstagramConnection } from '@domain/instagram/instagram-connection';
import { InstagramConnectionStatus, isInstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { InstagramConnectionRepositoryInterface } from '@domain/instagram/instagram-connection-repository-interface';
import type { InstagramTokenCipher } from '@infrastructure/instagram/instagram-token-cipher';

const UNIQUE_VIOLATION = 'P2002';

/**
 * **`instagram_connections`**, tokens encrypted at rest.
 *
 * @remarks
 * - A token that no longer decrypts (the secret it was sealed with changed)
 *   reads as an expired connection with an empty token — the owner reconnects.
 * - `purgeUser` hard-deletes the connection, the rules (their sends cascade)
 *   and any orphaned sends in one transaction.
 */
export class PrismaInstagramConnectionRepository implements InstagramConnectionRepositoryInterface {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: InstagramTokenCipher,
  ) {}

  findByUserId(userId: string): Promise<Result<InstagramConnection | null, Failure>> {
    return this.one({ userId });
  }

  findByIgUserId(igUserId: string): Promise<Result<InstagramConnection | null, Failure>> {
    return this.one({ igUserId });
  }

  async save(connection: InstagramConnection): Promise<Result<void, Failure>> {
    const columns = {
      igUserId: connection.igUserId,
      username: connection.username,
      accessTokenEnc: this.cipher.encrypt(connection.accessToken),
      tokenExpiresAt: connection.tokenExpiresAt,
      status: connection.status,
      refreshedAt: connection.refreshedAt,
    };
    try {
      await this.prisma.instagramConnection.upsert({
        where: { userId: connection.userId },
        create: { id: connection.id, userId: connection.userId, connectedAt: connection.connectedAt, ...columns },
        update: columns,
      });
      return ok(undefined);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return fail(new ConflictFailure('errors.conflict.instagram_account_linked'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async delete(userId: string): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      await this.prisma.instagramConnection.deleteMany({ where: { userId } });
    });
  }

  async listExpiringBefore(before: Date, limit: number): Promise<Result<InstagramConnection[], Failure>> {
    try {
      const rows = await this.prisma.instagramConnection.findMany({
        where: { status: InstagramConnectionStatus.Active, tokenExpiresAt: { lt: before } },
        orderBy: { tokenExpiresAt: 'asc' },
        take: limit,
      });
      return ok(rows.map((row) => this.toDomain(row)));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async expireLapsed(now: Date): Promise<Result<number, Failure>> {
    try {
      const { count } = await this.prisma.instagramConnection.updateMany({
        where: { status: InstagramConnectionStatus.Active, tokenExpiresAt: { lte: now } },
        data: { status: InstagramConnectionStatus.Expired },
      });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async purgeUser(userId: string): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      await this.prisma.$transaction([
        this.prisma.dmSend.deleteMany({ where: { userId } }),
        this.prisma.dmRule.deleteMany({ where: { userId } }),
        this.prisma.instagramConnection.deleteMany({ where: { userId } }),
      ]);
    });
  }

  private async one(where: Prisma.InstagramConnectionWhereUniqueInput): Promise<Result<InstagramConnection | null, Failure>> {
    try {
      const row = await this.prisma.instagramConnection.findUnique({ where });
      return ok(row === null ? null : this.toDomain(row));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  private toDomain(row: ConnectionRow): InstagramConnection {
    const token = this.cipher.decrypt(row.accessTokenEnc);
    const status = token !== null && isInstagramConnectionStatus(row.status) ? row.status : InstagramConnectionStatus.Expired;
    return InstagramConnection.restore({
      id: row.id,
      userId: row.userId,
      igUserId: row.igUserId,
      username: row.username,
      accessToken: token ?? '',
      tokenExpiresAt: row.tokenExpiresAt,
      status,
      connectedAt: row.connectedAt,
      refreshedAt: row.refreshedAt,
    });
  }

  private async guard(write: () => Promise<void>): Promise<Result<void, Failure>> {
    try {
      await write();
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
