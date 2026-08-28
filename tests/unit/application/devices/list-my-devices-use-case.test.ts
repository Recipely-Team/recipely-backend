import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { IDeviceRepository, DeviceRecord } from '@application/devices/ports/i-device-repository';
import { ListMyDevicesUseCase } from '@application/devices/use-cases/list-my-devices-use-case';

// ---- fixtures ----------------------------------------------------------------

const USER_ID = 'user-uuid';

function makeRecord(overrides: Partial<DeviceRecord> = {}): DeviceRecord {
  return {
    deviceId: 'device-1',
    platform: 'ios',
    appVersion: '1.0.0',
    lastLoginAt: new Date('2024-01-02T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeDeviceRepo(
  options: { listForUserResult?: Result<DeviceRecord[], Failure> } = {},
): { devices: IDeviceRepository; listForUserCalls: () => string[] } {
  const listForUserCalls: string[] = [];
  const devices: IDeviceRepository = {
    recordLogin: jest.fn(),
    async listForUser(userId): Promise<Result<DeviceRecord[], Failure>> {
      listForUserCalls.push(userId);
      return options.listForUserResult ?? ok([makeRecord()]);
    },
  };
  return { devices, listForUserCalls: () => listForUserCalls };
}

// ---- tests ---------------------------------------------------------------

describe('ListMyDevicesUseCase — happy path', () => {
  it('returns the devices reported by the repository for the given user', async () => {
    const record = makeRecord();
    const { devices, listForUserCalls } = makeDeviceRepo({ listForUserResult: ok([record]) });
    const useCase = new ListMyDevicesUseCase(devices);

    const result = await useCase.execute(USER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([record]);
    expect(listForUserCalls()).toEqual([USER_ID]);
  });
});

describe('ListMyDevicesUseCase — repository failure', () => {
  it('propagates the failure when listForUser fails', async () => {
    const repoFailure = new UnknownFailure('errors.db.read_failed');
    const { devices } = makeDeviceRepo({ listForUserResult: fail(repoFailure) });
    const useCase = new ListMyDevicesUseCase(devices);

    const result = await useCase.execute(USER_ID);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
