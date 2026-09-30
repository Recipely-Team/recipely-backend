import type { Request, Response } from 'express';
import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { ListRecipesUseCase } from '@application/recipes/use-cases/list-recipes-use-case';
import type { ListMyFavoritesUseCase } from '@application/favorites/use-cases/list-my-favorites-use-case';
import type { ListMyLikedRecipesUseCase } from '@application/likes/use-cases/list-my-liked-recipes-use-case';
import type { UploadAvatarUseCase } from '@application/auth/use-cases/upload-avatar-use-case';
import type { UpdateMyProfileUseCase } from '@application/users/use-cases/update-my-profile-use-case';
import type { GetMyProfileUseCase } from '@application/users/use-cases/get-my-profile-use-case';
import type { RequestCreatorTagUseCase } from '@application/users/use-cases/request-creator-tag-use-case';
import type { RemoveCreatorTagUseCase } from '@application/users/use-cases/remove-creator-tag-use-case';
import type { DeleteAccountUseCase } from '@application/auth/use-cases/delete-account-use-case';
import type { ListMyDevicesUseCase } from '@application/devices/use-cases/list-my-devices-use-case';
import type { RecordMyDeviceUseCase } from '@application/devices/use-cases/record-my-device-use-case';
import type { DeviceRecord } from '@application/devices/ports/device-repository-interface';
import type { TranslationService } from '@application/i18n/translation-service';
import { MeController } from '@presentation/controllers/me.controller';

// ---- helpers ----------------------------------------------------------------

const USER_ID = 'user-uuid';

function makeTranslationService(): TranslationService {
  return {
    t: (key: string) => key,
    localeFromRequest: () => 'en',
  };
}

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

function makeListMyDevices(result: Result<DeviceRecord[], Failure>): ListMyDevicesUseCase {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as ListMyDevicesUseCase;
}

function makeRecordMyDevice(result: Result<void, Failure>): RecordMyDeviceUseCase {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as RecordMyDeviceUseCase;
}

function makeController(
  listMyDevicesUC: ListMyDevicesUseCase,
  recordMyDeviceUC: RecordMyDeviceUseCase = makeRecordMyDevice(ok(undefined)),
): MeController {
  return new MeController(
    {} as ListRecipesUseCase,
    {} as ListMyFavoritesUseCase,
    makeTranslationService(),
    {} as UploadAvatarUseCase,
    {} as UpdateMyProfileUseCase,
    {} as GetMyProfileUseCase,
    {} as DeleteAccountUseCase,
    {} as ListMyLikedRecipesUseCase,
    listMyDevicesUC,
    recordMyDeviceUC,
    {} as RequestCreatorTagUseCase,
    {} as RemoveCreatorTagUseCase,
    1,
  );
}

function makeReq(body: unknown = {}): Request {
  return {
    body,
    headers: { 'user-agent': 'Recipely/1.0' },
    ip: '203.0.113.7',
    params: {},
    query: {},
    locale: 'en',
    user: { id: USER_ID, email: 'user@example.com' },
  } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock; send: jest.Mock } {
  const json = jest.fn();
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ json, send });
  const res = { status, json } as unknown as Response;
  return { res, status, json, send };
}

// ---- tests --------------------------------------------------------------

describe('MeController.myDevices', () => {
  it('returns the device list for the authenticated user', async () => {
    const record = makeRecord();
    const listMyDevicesUC = makeListMyDevices(ok([record]));
    const controller = makeController(listMyDevicesUC);
    const req = makeReq();
    const { res, status } = makeRes();
    const statusReturn = { json: jest.fn() };
    status.mockReturnValue(statusReturn);

    await controller.myDevices(req, res);

    expect(listMyDevicesUC.execute).toHaveBeenCalledWith(USER_ID);
    expect(status).toHaveBeenCalledWith(200);
    expect(statusReturn.json).toHaveBeenCalledWith([record]);
  });

  it('never returns ipAddress or userAgent — those stay admin-only', async () => {
    const record = makeRecord();
    const listMyDevicesUC = makeListMyDevices(ok([record]));
    const controller = makeController(listMyDevicesUC);
    const req = makeReq();
    const { res, status } = makeRes();
    const statusReturn = { json: jest.fn() };
    status.mockReturnValue(statusReturn);

    await controller.myDevices(req, res);

    const payload = statusReturn.json.mock.calls[0]?.[0] as DeviceRecord[];
    for (const device of payload) {
      expect(device).not.toHaveProperty('ipAddress');
      expect(device).not.toHaveProperty('userAgent');
    }
  });

  it('surfaces a repository failure through failureToHttp instead of a fake success', async () => {
    const listMyDevicesUC = makeListMyDevices(fail(new UnknownFailure('errors.db.read_failed')));
    const controller = makeController(listMyDevicesUC);
    const req = makeReq();
    const { res, status } = makeRes();

    await controller.myDevices(req, res);

    expect(status).toHaveBeenCalledWith(500);
  });
});

describe('MeController.recordMyDevice — the per-start device heartbeat', () => {
  const unusedList = (): ListMyDevicesUseCase => makeListMyDevices(ok([]));

  it('records the caller\'s device with the edge-read ip and user agent, then answers 204', async () => {
    const recordMyDeviceUC = makeRecordMyDevice(ok(undefined));
    const controller = makeController(unusedList(), recordMyDeviceUC);
    const req = makeReq({ deviceId: 'install-1', platform: 'android', appVersion: '1.0.50' });
    const { res, status, send } = makeRes();

    await controller.recordMyDevice(req, res);

    expect(recordMyDeviceUC.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      device: {
        deviceId: 'install-1',
        platform: 'android',
        appVersion: '1.0.50',
        ip: expect.any(String),
        userAgent: 'Recipely/1.0',
      },
    });
    expect(status).toHaveBeenCalledWith(204);
    expect(send).toHaveBeenCalled();
  });

  it('refuses a platform outside the vocabulary before touching the repository', async () => {
    const recordMyDeviceUC = makeRecordMyDevice(ok(undefined));
    const controller = makeController(unusedList(), recordMyDeviceUC);
    const { res } = makeRes();

    await expect(
      controller.recordMyDevice(makeReq({ deviceId: 'install-1', platform: 'windows' }), res),
    ).rejects.toThrow();
    expect(recordMyDeviceUC.execute).not.toHaveBeenCalled();
  });

  it('refuses a deviceId longer than 128 characters', async () => {
    const recordMyDeviceUC = makeRecordMyDevice(ok(undefined));
    const controller = makeController(unusedList(), recordMyDeviceUC);
    const { res } = makeRes();

    await expect(
      controller.recordMyDevice(makeReq({ deviceId: 'x'.repeat(129), platform: 'ios' }), res),
    ).rejects.toThrow();
    expect(recordMyDeviceUC.execute).not.toHaveBeenCalled();
  });

  it('surfaces a repository failure instead of a fake 204', async () => {
    const recordMyDeviceUC = makeRecordMyDevice(fail(new UnknownFailure('errors.db.write_failed')));
    const controller = makeController(unusedList(), recordMyDeviceUC);
    const { res, status } = makeRes();

    await controller.recordMyDevice(makeReq({ deviceId: 'install-1', platform: 'web' }), res);

    expect(status).toHaveBeenCalledWith(500);
  });
});
