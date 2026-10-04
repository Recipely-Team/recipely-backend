import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { meRoutes } from '@presentation/routes/me.routes';
import type { MeController } from '@presentation/controllers/me.controller';

// PUT /me/creator and DELETE /me/creator/:platform exist, sit behind auth, and reach their handlers.
function startServer(): { server: Server; requestCreatorTag: jest.Mock; removeCreatorTag: jest.Mock } {
  const requestCreatorTag = jest.fn(async (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  const removeCreatorTag = jest.fn(async (_req: Request, res: Response) => {
    res.status(204).end();
  });
  const controller = new Proxy(
    { requestCreatorTag, removeCreatorTag },
    { get: (target, key) => (key in target ? target[key as keyof typeof target] : jest.fn()) },
  ) as unknown as MeController;
  const auth = (req: Request, res: Response, next: NextFunction): void => {
    if (req.headers.authorization === undefined) {
      res.status(401).end();
      return;
    }
    req.user = { id: 'u1', email: 'u@example.com' };
    next();
  };
  const passThrough = (_req: Request, _res: Response, next: NextFunction): void => next();

  const app = express();
  app.use(express.json());
  app.use('/me', meRoutes(controller, auth, passThrough));
  return { server: http.createServer(app), requestCreatorTag, removeCreatorTag };
}

describe('meRoutes — /me/creator', () => {
  let server: Server;
  let requestCreatorTag: jest.Mock;
  let removeCreatorTag: jest.Mock;
  let url: string;

  beforeAll(async () => {
    ({ server, requestCreatorTag, removeCreatorTag } = startServer());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/me/creator`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('PUT reaches requestCreatorTag', async () => {
    const res = await fetch(url, { method: 'PUT', headers: { authorization: 'Bearer t' } });
    expect(res.status).toBe(200);
    expect(requestCreatorTag).toHaveBeenCalledTimes(1);
  });

  it('DELETE /:platform reaches removeCreatorTag with the platform', async () => {
    const res = await fetch(`${url}/tiktok`, { method: 'DELETE', headers: { authorization: 'Bearer t' } });
    expect(res.status).toBe(204);
    expect(removeCreatorTag).toHaveBeenCalledTimes(1);
    expect(removeCreatorTag.mock.calls[0]?.[0]?.params).toEqual({ platform: 'tiktok' });
  });

  it.each([
    ['PUT', ''],
    ['DELETE', '/instagram'],
  ])('%s needs a session', async (method, suffix) => {
    expect((await fetch(`${url}${suffix}`, { method })).status).toBe(401);
  });
});
