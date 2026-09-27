import type { PrismaClient } from '@prisma/client';
import { PrismaDeviceRepository } from '@infrastructure/repositories/devices/prisma-device-repository';
import { UnknownFailure } from '@core/failure';

// One row per (user, deviceId): recordLogin upserts on that composite unique
// so a repeat login from the same device updates lastLoginAt instead of
// growing the table, and listForUser is the read side an authenticated user
// hits from "my devices".

const USER_ID = 'user-uuid';
const DEVICE_ID = 'device-1';
/** Mirrors the repository's cap; a change to it should be a deliberate change here too. */
const MAX_DEVICES_PER_USER = 20;

type Mocks = {
  upsert: jest.Mock;
  findMany: jest.Mock;
  findUnique: jest.Mock;
  count: jest.Mock;
  deleteMany: jest.Mock;
};

function makePrisma(overrides: Partial<Mocks> = {}): { prisma: PrismaClient; mocks: Mocks } {
  const mocks: Mocks = {
    upsert: overrides.upsert ?? jest.fn().mockResolvedValue({}),
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    count: overrides.count ?? jest.fn().mockResolvedValue(0),
    deleteMany: overrides.deleteMany ?? jest.fn().mockResolvedValue({ count: 0 }),
  };

  const prisma = {
    device: {
      upsert: mocks.upsert,
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      count: mocks.count,
      deleteMany: mocks.deleteMany,
    },
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

// Review finding: nothing bounded how many rows one token could write, so a
// client minting a fresh deviceId per call grew the table — and the ip / user
// agent it stores — without limit.
describe('PrismaDeviceRepository.recordLogin — a user can hold at most 20 devices', () => {
  it('a 21st new device deletes the user\'s oldest row by lastLoginAt before inserting', async () => {
    const { prisma, mocks } = makePrisma({
      count: jest.fn().mockResolvedValue(MAX_DEVICES_PER_USER),
      findMany: jest.fn().mockResolvedValue([{ id: 'oldest-row' }]),
    });
    const repo = new PrismaDeviceRepository(prisma);

    const result = await repo.recordLogin({ userId: USER_ID, deviceId: 'device-new', platform: 'ios' });

    expect(result.ok).toBe(true);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID }, orderBy: { lastLoginAt: 'asc' }, take: 1 }),
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['oldest-row'] } } });
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it('trims every row above the cap, not just one, when the user is already over it', async () => {
    const { prisma, mocks } = makePrisma({ count: jest.fn().mockResolvedValue(MAX_DEVICES_PER_USER + 2) });
    const repo = new PrismaDeviceRepository(prisma);

    await repo.recordLogin({ userId: USER_ID, deviceId: 'device-new', platform: 'ios' });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  it('a new device below the cap deletes nothing', async () => {
    const { prisma, mocks } = makePrisma({ count: jest.fn().mockResolvedValue(MAX_DEVICES_PER_USER - 1) });
    const repo = new PrismaDeviceRepository(prisma);

    await repo.recordLogin({ userId: USER_ID, deviceId: 'device-new', platform: 'ios' });

    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it('a device the user already has only updates, even at the cap', async () => {
    const { prisma, mocks } = makePrisma({
      findUnique: jest.fn().mockResolvedValue({ id: 'known' }),
      count: jest.fn().mockResolvedValue(MAX_DEVICES_PER_USER),
    });
    const repo = new PrismaDeviceRepository(prisma);

    await repo.recordLogin({ userId: USER_ID, deviceId: DEVICE_ID, platform: 'ios' });

    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalled();
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
