import type { AddressInfo } from 'net';
import http from 'http';
import { createHmac } from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { TranslationService } from '@application/i18n/translation-service';
import { StartInstagramConnectUseCase } from '@application/instagram/connect/start-instagram-connect-use-case';
import { ReceiveInstagramAuthorizationUseCase } from '@application/instagram/connect/receive-instagram-authorization-use-case';
import { FinalizeInstagramConnectUseCase } from '@application/instagram/connect/finalize-instagram-connect-use-case';
import { RandomOneTimeCode } from '@infrastructure/instagram/random-one-time-code';
import { GetInstagramConnectionUseCase } from '@application/instagram/connect/get-instagram-connection-use-case';
import { DisconnectInstagramUseCase } from '@application/instagram/connect/disconnect-instagram-use-case';
import { ListInstagramMediaUseCase } from '@application/instagram/connect/list-instagram-media-use-case';
import { CreateDmRuleUseCase } from '@application/instagram/rules/create-dm-rule-use-case';
import { UpdateDmRuleUseCase } from '@application/instagram/rules/update-dm-rule-use-case';
import { DeleteDmRuleUseCase } from '@application/instagram/rules/delete-dm-rule-use-case';
import { GetDmRuleUseCase } from '@application/instagram/rules/get-dm-rule-use-case';
import { ListDmRulesUseCase } from '@application/instagram/rules/list-dm-rules-use-case';
import { ListDmSendsUseCase } from '@application/instagram/rules/list-dm-sends-use-case';
import { ReceiveInstagramWebhookUseCase } from '@application/instagram/delivery/receive-instagram-webhook-use-case';
import { DeleteInstagramDataUseCase } from '@application/instagram/delivery/delete-instagram-data-use-case';
import { JwtConnectStateSigner } from '@infrastructure/instagram/jwt-connect-state-signer';
import { MetaSignatureVerifier } from '@infrastructure/instagram/meta-signature-verifier';
import { InstagramController } from '@presentation/controllers/instagram/instagram.controller';
import { InstagramCallbackController } from '@presentation/controllers/instagram/instagram-callback.controller';
import { InstagramWebhookController } from '@presentation/controllers/instagram/instagram-webhook.controller';
import { instagramMeRoutes, instagramStartRoutes } from '@presentation/routes/instagram/instagram.routes';
import { instagramMetaRoutes } from '@presentation/routes/instagram/instagram-meta.routes';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { InMemoryCreatorTagRepository } from '../../fixtures/in-memory-creator-tag-repository';
import {
  IG_USER, InMemoryDmRules, InMemoryDmSends, InMemoryEventQueue, InMemoryInstagramConnections, InMemoryPendingLinks, OTHER_USER, USER, commentWebhook,
  connection, fakeGraph,
} from '../../fixtures/instagram-fakes';

const APP_SECRET = 'app-secret';
const SECRET = 's'.repeat(40);
const VERIFY = 'verify-token-123456';

function startServer() {
  const graph = fakeGraph();
  const state = new JwtConnectStateSigner(SECRET);
  const connections = new InMemoryInstagramConnections();
  const rules = new InMemoryDmRules();
  const sends = new InMemoryDmSends();
  const queue = new InMemoryEventQueue();
  const recipes = { getById: jest.fn() } as unknown as RecipeRepositoryInterface;
  const ts = { t: (key: string) => key } as unknown as TranslationService;
  const logger = { warn: jest.fn() };
  const tags = new InMemoryCreatorTagRepository().seed(USER).seed(OTHER_USER);
  const pending = new InMemoryPendingLinks();
  const codes = new RandomOneTimeCode();
  const controller = new InstagramController(
    {
      start: new StartInstagramConnectUseCase(graph, state, false),
      finalize: new FinalizeInstagramConnectUseCase(graph, pending, codes, connections, tags, logger),
      getConnection: new GetInstagramConnectionUseCase(connections, true),
      disconnect: new DisconnectInstagramUseCase(connections),
      listMedia: new ListInstagramMediaUseCase(graph, connections, { get: () => undefined, set: () => undefined }),
      createRule: new CreateDmRuleUseCase(graph, connections, rules, recipes),
      updateRule: new UpdateDmRuleUseCase(rules, recipes),
      deleteRule: new DeleteDmRuleUseCase(rules),
      getRule: new GetDmRuleUseCase(rules),
      listRules: new ListDmRulesUseCase(rules),
      listSends: new ListDmSendsUseCase(rules, sends),
    },
    ts,
  );
  const callback = new InstagramCallbackController(new ReceiveInstagramAuthorizationUseCase(graph, state, pending, codes, logger));
  const webhook = new InstagramWebhookController(
    { verifier: new MetaSignatureVerifier(APP_SECRET), verifyToken: VERIFY },
    new ReceiveInstagramWebhookUseCase(queue),
    new DeleteInstagramDataUseCase(connections),
    logger,
  );
  const auth = (req: Request, res: Response, next: NextFunction): void => {
    if (req.headers.authorization === undefined) {
      res.status(401).end();
      return;
    }
    req.user = { id: req.headers.authorization === 'Bearer other' ? OTHER_USER : USER, email: 'a@b.c' };
    next();
  };
  const app = express();
  app.use('/', instagramMetaRoutes(callback, webhook));
  app.use(express.json());
  app.use('/api/v1/auth/instagram', instagramStartRoutes(controller, auth));
  app.use('/api/v1/me/instagram', instagramMeRoutes(controller, auth));
  app.use(createErrorHandler(ts));
  return { server: http.createServer(app), state, connections, queue, graph };
}

describe('Instagram routes', () => {
  let ctx: ReturnType<typeof startServer>;
  let base: string;

  beforeAll(async () => {
    ctx = startServer();
    await new Promise<void>((resolve) => ctx.server.listen(0, resolve));
    base = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
  });

  const signed = (body: string, secret = APP_SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  it('answers Meta\'s subscription challenge only with the right verify token', async () => {
    const ok = await fetch(`${base}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
    expect([ok.status, await ok.text()]).toEqual([200, '12345']);
    expect((await fetch(`${base}/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`)).status).toBe(403);
  });

  it('queues a webhook signed over its raw body, and refuses an unsigned or re-serialised one', async () => {
    const body = JSON.stringify(commentWebhook());
    const accepted = await fetch(`${base}/webhooks/instagram`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signed(body) }, body });
    expect([accepted.status, await accepted.text()]).toEqual([200, 'EVENT_RECEIVED']);
    expect(ctx.queue.events).toHaveLength(1);

    const unsigned = await fetch(`${base}/webhooks/instagram`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect(unsigned.status).toBe(401);
    const reformatted = JSON.stringify(commentWebhook(), null, 2);
    const forged = await fetch(`${base}/webhooks/instagram`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signed(body) }, body: reformatted });
    expect(forged.status).toBe(401);
    expect(ctx.queue.events).toHaveLength(1);
  });

  it('start answers the consent URL for an allowed return link, behind a session', async () => {
    expect((await fetch(`${base}/api/v1/auth/instagram/start?returnTo=recipely://ig`)).status).toBe(401);
    const res = await fetch(`${base}/api/v1/auth/instagram/start?returnTo=${encodeURIComponent('recipely://ig')}`, { headers: { authorization: 'Bearer t' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toMatch(/^https:\/\/www\.instagram\.com\/oauth\/authorize\?state=/);
    const evil = await fetch(`${base}/api/v1/auth/instagram/start?returnTo=${encodeURIComponent('https://evil.example')}`, { headers: { authorization: 'Bearer t' } });
    expect(evil.status).toBe(400);
  });

  const callbackCode = async (userId: string): Promise<string> => {
    const state = await ctx.state.sign({ userId, returnTo: 'recipely://instagram/connected' });
    const res = await fetch(`${base}/auth/instagram/callback?code=c0de&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect([location.protocol, location.host, location.searchParams.get('status')]).toEqual(['recipely:', 'instagram', 'authorized']);
    return location.searchParams.get('code') ?? '';
  };
  const finalize = (code: string, auth = 'Bearer t') =>
    fetch(`${base}/api/v1/me/instagram/finalize`, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ code }) });

  it('callback parks the authorization and the app finalises it with its session', async () => {
    const code = await callbackCode(USER);
    expect(ctx.connections.rows.has(USER)).toBe(false);
    const res = await finalize(code);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ creatorTag: 'approved', connection: { connected: true, username: 'ada.cooks' } });
    expect(ctx.connections.rows.get(USER)?.igUserId).toBe(IG_USER);
    expect((await finalize(code)).status).toBe(404);
  });

  // An attacker starts a connect on their own account and gets a creator to
  // approve it: the code lands in the creator's app, under the creator's
  // session, and must not link the creator's Instagram to the attacker.
  it('finalise refuses a code minted for another user', async () => {
    ctx.connections.rows.clear();
    const code = await callbackCode(OTHER_USER);
    const res = await finalize(code, 'Bearer t');
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.instagram.link_invalid');
    expect(ctx.connections.rows.size).toBe(0);
  });

  it('callback reports a declined consent', async () => {
    const state = await ctx.state.sign({ userId: USER, returnTo: 'recipely://instagram/connected' });
    const denied = await fetch(`${base}/auth/instagram/callback?error=access_denied&state=${encodeURIComponent(state)}`, { redirect: 'manual' });
    expect(denied.headers.get('location')).toBe('recipely://instagram/connected?status=error&reason=denied');
  });

  it('callback refuses a forged state with a plain page, redirecting nowhere', async () => {
    const res = await fetch(`${base}/auth/instagram/callback?code=c&state=forged`, { redirect: 'manual' });
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toContain('go back to Recipely');
  });

  it('GET /me/instagram answers the link without its token', async () => {
    ctx.connections.seed(connection());
    const res = await fetch(`${base}/api/v1/me/instagram`, { headers: { authorization: 'Bearer t' } });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ connected: true, available: true, username: 'ada.cooks', status: 'active' });
    expect(JSON.stringify(body)).not.toContain('token-1');
    expect(body).not.toHaveProperty('accessToken');
  });

  it('refuses a rule body with a catalogue key', async () => {
    const res = await fetch(`${base}/api/v1/me/instagram/rules`, {
      method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify({ mediaId: 'm', keywords: [], recipeId: '00000000-0000-4000-8000-0000000000aa', dmText: 'x' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { messageKey: string } }).error.messageKey).toBe('errors.validation.dm_rule_keywords_invalid');
  });

  it('data-deletion verifies the signed_request and answers a confirmation', async () => {
    ctx.connections.seed(connection());
    const payload = Buffer.from(JSON.stringify({ user_id: IG_USER, algorithm: 'HMAC-SHA256' })).toString('base64url');
    const signedRequest = `${createHmac('sha256', APP_SECRET).update(payload).digest('base64url')}.${payload}`;
    const res = await fetch(`${base}/webhooks/instagram/data-deletion`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ signed_request: signedRequest }).toString(),
    });
    const body = (await res.json()) as { url: string; confirmation_code: string };
    expect(res.status).toBe(200);
    expect(body.confirmation_code).toMatch(new RegExp(`^ig-${IG_USER}-`));
    expect(body.url).toContain(body.confirmation_code);
    expect(ctx.connections.purged).toContain(USER);

    const bad = await fetch(`${base}/webhooks/instagram/data-deletion`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'signed_request=abc.def',
    });
    expect(bad.status).toBe(401);
  });
});
