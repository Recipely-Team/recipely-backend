import type { PrismaClient } from '@prisma/client';
import { PrismaDeviceRepository } from '@infrastructure/repositories/devices/prisma-device-repository';
import { UnknownFailure } from '@core/failure';

// One row per (user, deviceId): recordLogin upserts on that composite unique
// so a repeat login from the same device updates lastLoginAt instead of
// growing the table, and listForUser is the read side an authenticated user
// hits from "my devices".

const USER_ID = 'user-uuid';
const DEVICE_ID = 'device-1';

type Mocks = {
  upsert: jest.Mock;
  findMany: jest.Mock;
};

function makePrisma(overrides: Partial<Mocks> = {}): { prisma: PrismaClient; mocks: Mocks } {
  const mocks: Mocks = {
    upsert: overrides.upsert ?? jest.fn().mockResolvedValue({}),
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
  };

  const prisma = {
    device: { upsert: mocks.upsert, findMany: mocks.findMany },
  } as unknown as PrismaClient;

  return { prisma, mocks };
}

describe('PrismaDeviceRepository.recordLogin', () => {
  it('upserts on the (userId, deviceId) composite unique', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaDeviceRepository(prisma);

    const result = await repo.recordLogin({
      userId: USER_ID,
      deviceId: DEVICE_ID,
      platform: 'ios',
      appVersion: '1.0.0',
      ip: '1.2.3.4',
      userAgent: 'RecipelyApp/1.0',
    });

    expect(result.ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_deviceId: { userId: USER_ID, deviceId: DEVICE_ID } },
      }),
    );
  });

  it('sets lastLoginAt to a fresh timestamp on the update branch', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaDeviceRepository(prisma);

    await repo.recordLogin({ userId: USER_ID, deviceId: DEVICE_ID, platform: 'android' });

    const call = mocks.upsert.mock.calls[0]?.[0] as { update: { lastLoginAt: Date } };
    expect(call.update.lastLoginAt).toBeInstanceOf(Date);
  });

  it('falls back to null for optional fields that were not supplied', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaDeviceRepository(prisma);

    await repo.recordLogin({ userId: USER_ID, deviceId: DEVICE_ID, platform: 'web' });

    const call = mocks.upsert.mock.calls[0]?.[0] as {
      create: { appVersion: unknown; ipAddress: unknown; userAgent: unknown };
    };
    expect(call.create.appVersion).toBeNull();
    expect(call.create.ipAddress).toBeNull();
    expect(call.create.userAgent).toBeNull();
  });

  it('maps an unexpected error to UnknownFailure without throwing', async () => {
    const { prisma } = makePrisma({ upsert: jest.fn().mockRejectedValue(new Error('connection reset')) });
    const repo = new PrismaDeviceRepository(prisma);

    const result = await repo.recordLogin({ userId: USER_ID, deviceId: DEVICE_ID, platform: 'ios' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnknownFailure);
    }
  });
});

describe('PrismaDeviceRepository.listForUser', () => {
  it('orders devices by lastLoginAt descending and maps rows to the DTO', async () => {
    const rows = [
      {
        deviceId: 'device-2',
        platform: 'android',
        appVersion: '2.0.0',
        lastLoginAt: new Date('2024-02-01T00:00:00.000Z'),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ];
    const { prisma, mocks } = makePrisma({ findMany: jest.fn().mockResolvedValue(rows) });
    const repo = new PrismaDeviceRepository(prisma);

    const result = await repo.listForUser(USER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(rows);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        orderBy: { lastLoginAt: 'desc' },
      }),
    );
  });

  it('does not select ipAddress or userAgent — those stay admin-only', async () => {
    const { prisma, mocks } = makePrisma();
    const repo = new PrismaDeviceRepository(prisma);

    await repo.listForUser(USER_ID);

    const call = mocks.findMany.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(call.select).not.toHaveProperty('ipAddress');
    expect(call.select).not.toHaveProperty('userAgent');
  });

  it('maps an unexpected error to UnknownFailure without throwing', async () => {
    const { prisma } = makePrisma({ findMany: jest.fn().mockRejectedValue(new Error('connection reset')) });
    const repo = new PrismaDeviceRepository(prisma);

    const result = await repo.listForUser(USER_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBeInstanceOf(UnknownFailure);
    }
  });
});
