import type { AddressInfo } from 'net';
import http, { type Server } from 'http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { usersRoutes } from '@presentation/routes/users.routes';
import type { UsersController } from '@presentation/controllers/users.controller';

/**
 * The creator page is public: a guest opens `/users/:id` and its recipes, and
 * the Explore strip reads `/users/creators`, which must not be swallowed by
 * `/:id`. Following still needs a session. Stub middlewares stand in for the
 * real ones — only which route gets which guard is under test.
 */

const USER_ID = '6f1c2f7e-2b1a-4c1e-9f0a-1a2b3c4d5e6f';

function startServer(): { server: Server; spies: Record<string, jest.Mock> } {
  const reply = (name: string): jest.Mock =>
    jest.fn(async (req: Request, res: Response) => {
      res.status(200).json({ handler: name, user: req.user?.id ?? null });
    });
  const spies = {
    listCreators: reply('listCreators'),
    getProfile: reply('getProfile'),
    getRecipes: reply('getRecipes'),
    follow: reply('follow'),
    unfollow: reply('unfollow'),
  };
  const controller = spies as unknown as UsersController;
  const signedIn = (req: Request): boolean => req.headers.authorization !== undefined;
  const auth = (req: Request, res: Response, next: NextFunction): void => {
    if (!signedIn(req)) {
      res.status(401).end();
      return;
    }
    req.user = { id: 'viewer', email: 'v@example.com' };
    next();
  };
  const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
    if (signedIn(req)) req.user = { id: 'viewer', email: 'v@example.com' };
    next();
  };

  const app = express();
  app.use('/users', usersRoutes(controller, auth, optionalAuth));
  return { server: http.createServer(app), spies };
}

describe('usersRoutes — guest access and route order', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server } = startServer());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/users`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const get = async (path: string, token?: string): Promise<{ status: number; body: unknown }> => {
    const res = await fetch(baseUrl + path, token ? { headers: { authorization: token } } : {});
    return { status: res.status, body: res.status === 200 ? await res.json() : null };
  };

  it('serves GET /creators to a guest, before /:id can take it', async () => {
    expect(await get('/creators')).toEqual({ status: 200, body: { handler: 'listCreators', user: null } });
  });

  it('serves a guest the profile page', async () => {
    expect(await get(`/${USER_ID}`)).toEqual({ status: 200, body: { handler: 'getProfile', user: null } });
  });

  it("serves a guest the profile's recipes", async () => {
    expect(await get(`/${USER_ID}/recipes`)).toEqual({ status: 200, body: { handler: 'getRecipes', user: null } });
  });

  it('still identifies a signed-in viewer on the profile', async () => {
    expect(await get(`/${USER_ID}`, 'Bearer t')).toEqual({ status: 200, body: { handler: 'getProfile', user: 'viewer' } });
  });

  it('still requires a session to follow', async () => {
    const res = await fetch(`${baseUrl}/${USER_ID}/follow`, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
