import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { FollowerPoint, FollowerSnapshotRepositoryInterface } from '@domain/instagram/follower-snapshot-repository-interface';

const DAY_KEY_LENGTH = 10;

/** **`instagram_follower_snapshots`** — one row per creator per UTC day, keyed `(user_id, day)`. */
export class PrismaFollowerSnapshotRepository implements FollowerSnapshotRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async record(userId: string, day: string, followers: number, mediaCount: number): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      const date = asDate(day);
      await this.prisma.instagramFollowerSnapshot.upsert({
        where: { userId_day: { userId, day: date } },
        create: { userId, day: date, followers, mediaCount },
        update: { followers, mediaCount },
      });
    });
  }

  async listMissing(day: string, limit: number): Promise<Result<string[], Failure>> {
    return this.guard(async () => {
      const rows = await this.prisma.instagramConnection.findMany({
        where: { status: InstagramConnectionStatus.Active, user: { instagramFollowerSnapshots: { none: { day: asDate(day) } } } },
        select: { userId: true },
        orderBy: { userId: 'asc' },
        take: limit,
      });
      return rows.map((row) => row.userId);
    });
  }

  async listSince(userId: string, fromDay: string): Promise<Result<FollowerPoint[], Failure>> {
    return this.guard(async () => {
      const rows = await this.prisma.instagramFollowerSnapshot.findMany({
        where: { userId, day: { gte: asDate(fromDay) } },
        select: { day: true, followers: true },
        orderBy: { day: 'asc' },
      });
      return rows.map((row) => ({ day: dayKey(row.day), followers: row.followers }));
    });
  }

  async firstDay(userId: string): Promise<Result<string | null, Failure>> {
    return this.guard(async () => {
      const row = await this.prisma.instagramFollowerSnapshot.findFirst({ where: { userId }, select: { day: true }, orderBy: { day: 'asc' } });
      return row === null ? null : dayKey(row.day);
    });
  }

  private async guard<T>(run: () => Promise<T>): Promise<Result<T, Failure>> {
    try {
      return ok(await run());
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
  }
}

const asDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const dayKey = (date: Date): string => date.toISOString().slice(0, DAY_KEY_LENGTH);
