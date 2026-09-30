import type { Request, Response } from 'express';
import { fail, ok } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import type { TranslationService } from '@application/i18n/translation-service';
import type { RequestCreatorTagUseCase } from '@application/users/use-cases/request-creator-tag-use-case';
import type { RemoveCreatorTagUseCase } from '@application/users/use-cases/remove-creator-tag-use-case';
import { MeController } from '@presentation/controllers/me.controller';

const ts: TranslationService = { t: (key: string) => key, localeFromRequest: () => 'en' };

function makeController(request: jest.Mock, remove: jest.Mock = jest.fn()): MeController {
  const unused = {} as never;
  return new MeController(
    unused, unused, ts, unused, unused, unused, unused, unused, unused, unused,
    { execute: request } as unknown as RequestCreatorTagUseCase,
    { execute: remove } as unknown as RemoveCreatorTagUseCase,
    1,
  );
}

function makeReq(body: unknown = {}): Request {
  return { body, locale: 'en', user: { id: 'u1', email: 'u@example.com' } } as unknown as Request;
}

function makeRes(): Response & { status: jest.Mock; json: jest.Mock; send: jest.Mock } {
  const res = { status: jest.fn(), json: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock; send: jest.Mock };
}

describe('MeController.requestCreatorTag (PUT /me/creator)', () => {
  it('answers 200 with the bare creator object', async () => {
    const creator = { platform: CreatorPlatform.TikTok, handle: 'ada', status: CreatorStatus.Pending };
    const execute = jest.fn().mockResolvedValue(ok(creator));
    const res = makeRes();

    await makeController(execute).requestCreatorTag(makeReq({ platform: 'tiktok', handle: '@Ada' }), res);

    expect(execute).toHaveBeenCalledWith({ userId: 'u1', platform: CreatorPlatform.TikTok, handle: '@Ada' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(creator);
  });

  it('answers 400 errors.validation.creator_handle for a bad handle', async () => {
    const execute = jest.fn().mockResolvedValue(fail(new ValidationFailure('errors.validation.creator_handle', 'handle')));
    const res = makeRes();

    await makeController(execute).requestCreatorTag(makeReq({ platform: 'instagram', handle: '..' }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.messageKey).toBe('errors.validation.creator_handle');
  });

  it('refuses an unknown platform before the use case runs', async () => {
    const execute = jest.fn();
    await expect(
      makeController(execute).requestCreatorTag(makeReq({ platform: 'myspace', handle: 'ada' }), makeRes()),
    ).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('MeController.removeCreatorTag (DELETE /me/creator)', () => {
  it('answers 204', async () => {
    const remove = jest.fn().mockResolvedValue(ok(undefined));
    const res = makeRes();

    await makeController(jest.fn(), remove).removeCreatorTag(makeReq(), res);

    expect(remove).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });
});
