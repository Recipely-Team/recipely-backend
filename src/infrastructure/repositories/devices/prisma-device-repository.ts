import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  DeviceRepositoryInterface,
  RecordLoginInput,
  DeviceRecord,
} from '@application/devices/ports/device-repository-interface';

/** How many device rows one user may hold; a new device past this evicts the oldest. */
const MAX_DEVICES_PER_USER = 20;

/**
 * Prisma-backed device log: one row per (user, deviceId).
 *
 * @remarks
 * - **Per-user cap** — a NEW deviceId that would take the user past
 *   {@link MAX_DEVICES_PER_USER} rows first deletes their oldest by `lastLoginAt`.
 *   The route is rate limited too, but a limit bounds the rate, not the total:
 *   a token minting fresh device ids would otherwise grow the table (and the
 *   ip / user-agent it stores) without end. A repeat device only updates.
 * - **Not transactional** — two concurrent first logins can briefly leave the
 *   user one row over; the next new device trims it back. A soft cap is enough.
 */
export class PrismaDeviceRepository implements DeviceRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async recordLogin(input: RecordLoginInput): Promise<Result<void, Failure>> {
    try {
      await this.evictOldestIfNew(input.userId, input.deviceId);
      await this.prisma.device.upsert({
        where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } },
        update: {
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          ipAddress: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          lastLoginAt: new Date(),
        },
        create: {
          userId: input.userId,
          deviceId: input.deviceId,
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          ipAddress: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          locale: input.locale ?? null,
        },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  private async evictOldestIfNew(userId: string, deviceId: string): Promise<void> {
    const known = await this.prisma.device.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { id: true },
    });
    if (known !== null) return;
    const count = await this.prisma.device.count({ where: { userId } });
    const excess = count - MAX_DEVICES_PER_USER + 1;
    if (excess <= 0) return;
    const oldest = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastLoginAt: 'asc' },
      take: excess,
      select: { id: true },
    });
    await this.prisma.device.deleteMany({ where: { id: { in: oldest.map((row) => row.id) } } });
  }

  async listForUser(userId: string): Promise<Result<DeviceRecord[], Failure>> {
    try {
      const rows = await this.prisma.device.findMany({
        where: { userId },
        orderBy: { lastLoginAt: 'desc' },
        select: { deviceId: true, platform: true, appVersion: true, lastLoginAt: true, createdAt: true },
      });
      return ok(rows);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
