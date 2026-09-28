import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { meRoutes } from '@presentation/routes/me.routes';
import { createDeviceRateLimitMiddleware } from '@presentation/middlewares/device-rate-limit';
import { TooManyRequestsFailure } from '@core/failure';
import type { MeController } from '@presentation/controllers/me.controller';

/**
 * Review finding: `POST /me/devices` had no limiter, so one valid token could
 * write device rows — each carrying an ip and a user agent — as fast as it could
 * send. The route now takes 30 per user per hour; the 31st answers 429.
 */

const HOURLY_BUDGET = 30;
const TOO_MANY_REQUESTS = 429;

function startServer(): { server: Server; recordMyDevice: jest.Mock; myDevices: jest.Mock } {
  const reply = (): jest.Mock =>
    jest.fn(async (_req: Request, res: Response) => {
      res.status(204).end();
    });
  const recordMyDevice = reply();
  const myDevices = reply();
  const controller = new Proxy(
    { recordMyDevice, myDevices },
    { get: (target, key) => (key in target ? target[key as keyof typeof target] : reply()) },
  ) as unknown as MeController;
  const auth = (req: Request, _res: Response, next: NextFunction): void => {
    req.user = { id: String(req.headers['x-user'] ?? 'u1'), email: 'u@example.com' };
    next();
  };

  const app = express();
  app.use('/me', meRoutes(controller, auth, createDeviceRateLimitMiddleware(1)));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err instanceof TooManyRequestsFailure ? TOO_MANY_REQUESTS : 500).end();
  });
  return { server: http.createServer(app), recordMyDevice, myDevices };
}

describe('meRoutes — POST /me/devices is rate limited per user', () => {
  let server: Server;
  let recordMyDevice: jest.Mock;
  let myDevices: jest.Mock;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, recordMyDevice, myDevices } = startServer());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (method: 'GET' | 'POST', user: string): Promise<globalThis.Response> =>
    fetch(`${baseUrl}/me/devices`, { method, headers: { 'x-user': user, 'content-type': 'application/json' } });

  it('a token that sends one heartbeat too many in an hour is refused with 429', async () => {
    for (let i = 0; i < HOURLY_BUDGET; i += 1) {
      expect((await send('POST', 'flooder')).status).toBe(204);
    }

    const refused = await send('POST', 'flooder');

    expect(refused.status).toBe(TOO_MANY_REQUESTS);
    expect(recordMyDevice).toHaveBeenCalledTimes(HOURLY_BUDGET);
  });

  it('the limit is per user and leaves the device list readable', async () => {
    expect((await send('POST', 'someone-else')).status).toBe(204);
    expect((await send('GET', 'flooder')).status).toBe(204);
    expect(myDevices).toHaveBeenCalledTimes(1);
  });
});
