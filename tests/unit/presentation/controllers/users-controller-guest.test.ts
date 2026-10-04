import type { Request, Response } from 'express';
import { ok } from '@core/result/result';
import type { TranslationService } from '@application/i18n/translation-service';
import type { GetUserProfileUseCase } from '@application/users/use-cases/get-user-profile-use-case';
import type { ListCreatorsUseCase } from '@application/users/use-cases/list-creators-use-case';
import { UsersController } from '@presentation/controllers/users.controller';

const ts: TranslationService = { t: (key: string) => key, localeFromRequest: () => 'en' };
const USER_ID = '6f1c2f7e-2b1a-4c1e-9f0a-1a2b3c4d5e6f';

function makeController(getProfile: jest.Mock, listCreators: jest.Mock = jest.fn()): UsersController {
  const unused = {} as never;
  return new UsersController(
    { execute: getProfile } as unknown as GetUserProfileUseCase,
    unused,
    ts,
    unused,
    unused,
    { execute: listCreators } as unknown as ListCreatorsUseCase,
  );
}

function makeRes(): Response & { status: jest.Mock; json: jest.Mock } {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

describe('UsersController.getProfile — public creator page', () => {
  it('serves a guest, asking as nobody (so isFollowedByMe is false)', async () => {
    const execute = jest.fn().mockResolvedValue(ok({ id: USER_ID, isFollowedByMe: false }));
    const res = makeRes();

    await makeController(execute).getProfile({ params: { id: USER_ID }, locale: 'en' } as unknown as Request, res);

    expect(execute).toHaveBeenCalledWith({ userId: USER_ID });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('passes a signed-in viewer on', async () => {
    const execute = jest.fn().mockResolvedValue(ok({ id: USER_ID }));
    const req = { params: { id: USER_ID }, locale: 'en', user: { id: 'viewer', email: 'v@x.co' } } as unknown as Request;

    await makeController(execute).getProfile(req, makeRes());

    expect(execute).toHaveBeenCalledWith({ userId: USER_ID, currentUserId: 'viewer' });
  });
});

describe('UsersController.listCreators (GET /users/creators)', () => {
  it('defaults the page and page size', async () => {
    const listCreators = jest.fn().mockResolvedValue(ok({ items: [], total: 0, page: 1, pageSize: 20 }));
    await makeController(jest.fn(), listCreators).listCreators({ query: {}, locale: 'en' } as unknown as Request, makeRes());
    expect(listCreators).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('accepts a page size over the cap and leaves capping to the use case', async () => {
    const listCreators = jest.fn().mockResolvedValue(ok({ items: [], total: 0, page: 2, pageSize: 50 }));
    const res = makeRes();
    await makeController(jest.fn(), listCreators).listCreators(
      { query: { page: '2', pageSize: '500' }, locale: 'en' } as unknown as Request,
      res,
    );
    expect(listCreators).toHaveBeenCalledWith({ page: 2, pageSize: 500 });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
