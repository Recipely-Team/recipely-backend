import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type {
  DeviceRepositoryInterface,
  RecordLoginInput,
} from '@application/devices/ports/device-repository-interface';
import { RecordMyDeviceUseCase } from '@application/devices/use-cases/record-my-device-use-case';

const USER_ID = 'user-uuid';

function makeDeviceRepo(
  result: Result<void, Failure> = ok(undefined),
): { devices: DeviceRepositoryInterface; calls: RecordLoginInput[] } {
  const calls: RecordLoginInput[] = [];
  const devices: DeviceRepositoryInterface = {
    async recordLogin(input): Promise<Result<void, Failure>> {
      calls.push(input);
      return result;
    },
    listForUser: jest.fn(),
  };
  return { devices, calls };
}

describe('RecordMyDeviceUseCase', () => {
  it('upserts the caller\'s device through recordLogin, keyed on the caller', async () => {
    const { devices, calls } = makeDeviceRepo();
    const useCase = new RecordMyDeviceUseCase(devices);

    const result = await useCase.execute({
      userId: USER_ID,
      device: { deviceId: 'install-1', platform: 'web', appVersion: '1.0.50', ip: '203.0.113.7', userAgent: 'UA' },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { userId: USER_ID, deviceId: 'install-1', platform: 'web', appVersion: '1.0.50', ip: '203.0.113.7', userAgent: 'UA' },
    ]);
  });

  it('propagates a repository failure', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { devices } = makeDeviceRepo(fail(repoFailure));
    const useCase = new RecordMyDeviceUseCase(devices);

    const result = await useCase.execute({ userId: USER_ID, device: { deviceId: 'install-1', platform: 'ios' } });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
