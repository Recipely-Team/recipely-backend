import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  DeviceRepositoryInterface,
  RecordLoginInput,
  DeviceRecord,
} from '@application/devices/ports/device-repository-interface';

export class PrismaDeviceRepository implements DeviceRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async recordLogin(input: RecordLoginInput): Promise<Result<void, Failure>> {
    try {
      await this.prisma.device.upsert({
        where: { userId_deviceId: { userId: input.userId, deviceId: input.deviceId } },
        update: {
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          ipAddress: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          lastLoginAt: new Date(),
        },
        create: {
          userId: input.userId,
          deviceId: input.deviceId,
          platform: input.platform,
          appVersion: input.appVersion ?? null,
          ipAddress: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
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
