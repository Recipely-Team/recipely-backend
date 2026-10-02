import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure, UnauthorizedFailure } from '@core/failure';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CreatorStatus } from '@domain/users/creator-status';
import type { ConnectStateSignerInterface } from '@application/instagram/ports/connect-state-signer-interface';
import { StartInstagramConnectUseCase } from '@application/instagram/connect/start-instagram-connect-use-case';
import { CompleteInstagramConnectUseCase } from '@application/instagram/connect/complete-instagram-connect-use-case';
import { GetInstagramConnectionUseCase } from '@application/instagram/connect/get-instagram-connection-use-case';
import { DisconnectInstagramUseCase } from '@application/instagram/connect/disconnect-instagram-use-case';
import { RefreshInstagramTokensUseCase } from '@application/instagram/connect/refresh-instagram-tokens-use-case';
import { ListInstagramMediaUseCase } from '@application/instagram/connect/list-instagram-media-use-case';
import { InMemoryCreatorTagRepository } from '../../fixtures/in-memory-creator-tag-repository';
import { approvedTag, pendingTag } from '../../fixtures/creator-tags';
import { IG_USER, InMemoryInstagramConnections, NOW, OTHER_USER, USER, connection, fakeGraph, media } from '../../fixtures/instagram-fakes';

const RETURN = 'recipely://instagram/connected';
const DAY = 24 * 60 * 60 * 1000;

function stateSigner(valid = true): ConnectStateSignerInterface & { sign: jest.Mock; verify: jest.Mock } {
  return {
    sign: jest.fn().mockResolvedValue('signed-state'),
    verify: jest.fn().mockResolvedValue(valid ? ok({ userId: USER, returnTo: RETURN }) : fail(new UnauthorizedFailure('errors.instagram.state_invalid'))),
  };
}

describe('StartInstagramConnectUseCase', () => {
  it('answers the consent URL with a state naming the user and return link', async () => {
    const state = stateSigner();
    const result = await new StartInstagramConnectUseCase(fakeGraph(), state).execute({ userId: USER, returnTo: RETURN });
    expect(state.sign).toHaveBeenCalledWith({ userId: USER, returnTo: RETURN });
    expect(result).toEqual({ ok: true, value: { url: 'https://www.instagram.com/oauth/authorize?state=signed-state' } });
  });

  it.each(['https://evil.example/steal', 'javascript:alert(1)', 'recipelyx://x'])('refuses a return link %p outside the allowlist', async (returnTo) => {
    const result = await new StartInstagramConnectUseCase(fakeGraph(), stateSigner()).execute({ userId: USER, returnTo });
    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.instagram_return_invalid');
  });

  it('answers not_configured without an Instagram app', async () => {
    const result = await new StartInstagramConnectUseCase(null, stateSigner()).execute({ userId: USER, returnTo: RETURN });
    expect(!result.ok && result.failure.messageKey).toBe('errors.instagram.not_configured');
  });
});

describe('CompleteInstagramConnectUseCase', () => {
  function setup(opts: { valid?: boolean } = {}) {
    const graph = fakeGraph();
    const connections = new InMemoryInstagramConnections();
    const tags = new InMemoryCreatorTagRepository().seed(USER).seed(OTHER_USER);
    const logger = { warn: jest.fn() };
    const useCase = new CompleteInstagramConnectUseCase(graph, stateSigner(opts.valid ?? true), connections, tags, logger, () => NOW);
    return { graph, connections, tags, logger, useCase };
  }

  it('links the account with a long-lived token, turns on webhooks and approves the Instagram creator tag', async () => {
    const s = setup();
    const result = await s.useCase.execute({ code: 'c0de', state: 's' });
    expect(result).toEqual({ ok: true, value: { returnTo: RETURN, status: 'connected', username: 'ada.cooks', creatorTag: 'approved' } });
    expect(s.graph.exchangeCode).toHaveBeenCalledWith('c0de');
    expect(s.graph.longLived).toHaveBeenCalledWith('short');
    const saved = s.connections.rows.get(USER);
    expect([saved?.igUserId, saved?.username, saved?.accessToken, saved?.status]).toEqual([IG_USER, 'ada.cooks', 'long', 'active']);
    expect(saved?.tokenExpiresAt.getTime()).toBe(NOW.getTime() + 60 * DAY);
    expect(s.graph.subscribeWebhooks).toHaveBeenCalledWith('long');
    const tag = s.tags.tag(USER, CreatorPlatform.Instagram);
    expect([tag?.handle, tag?.status]).toEqual(['ada.cooks', CreatorStatus.Approved]);
  });

  it('replaces a pending manual claim with the verified username', async () => {
    const s = setup();
    s.tags.seed(USER, pendingTag('someone_else'));
    await s.useCase.execute({ code: 'c', state: 's' });
    expect(s.tags.tag(USER, CreatorPlatform.Instagram)?.handle).toBe('ada.cooks');
    expect(s.tags.tag(USER, CreatorPlatform.Instagram)?.isApproved).toBe(true);
  });

  it('reports taken, and keeps the link, when another user holds the handle approved', async () => {
    const s = setup();
    s.tags.seed(OTHER_USER, approvedTag('ada.cooks'));
    const result = await s.useCase.execute({ code: 'c', state: 's' });
    expect(result.ok && result.value).toMatchObject({ status: 'connected', creatorTag: 'taken' });
    expect(s.connections.rows.has(USER)).toBe(true);
    expect(s.tags.tag(USER, CreatorPlatform.Instagram)).toBeNull();
  });

  it('reports invalid for a username the handle rules refuse', async () => {
    const s = setup();
    s.graph.profile.mockResolvedValue(ok({ igUserId: IG_USER, username: 'a..b', mediaCount: 0 }));
    const result = await s.useCase.execute({ code: 'c', state: 's' });
    expect(result.ok && result.value).toMatchObject({ creatorTag: 'invalid' });
  });

  it('refuses an Instagram account linked to another user', async () => {
    const s = setup();
    s.connections.seed(connection({ id: 'conn-2', userId: OTHER_USER }));
    const result = await s.useCase.execute({ code: 'c', state: 's' });
    expect(result).toEqual({ ok: true, value: { returnTo: RETURN, status: 'error', reason: 'account_linked' } });
    expect(s.connections.rows.has(USER)).toBe(false);
  });

  it('reports denied when the user declined on instagram.com', async () => {
    const s = setup();
    const result = await s.useCase.execute({ error: 'access_denied', state: 's' });
    expect(result.ok && result.value).toMatchObject({ status: 'error', reason: 'denied' });
    expect(s.graph.exchangeCode).not.toHaveBeenCalled();
  });

  it('reports failed, and logs the step, when a token exchange fails', async () => {
    const s = setup();
    s.graph.longLived.mockResolvedValue(fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed')));
    const result = await s.useCase.execute({ code: 'c', state: 's' });
    expect(result.ok && result.value).toMatchObject({ status: 'error', reason: 'failed' });
    expect(s.logger.warn).toHaveBeenCalledWith(expect.objectContaining({ step: 'long_lived' }), 'instagram_connect_failed');
  });

  it('keeps the connection when switching on webhooks fails', async () => {
    const s = setup();
    s.graph.subscribeWebhooks.mockResolvedValue(fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed')));
    const result = await s.useCase.execute({ code: 'c', state: 's' });
    expect(result.ok && result.value.status).toBe('connected');
    expect(s.logger.warn).toHaveBeenCalledWith(expect.anything(), 'instagram_webhook_subscribe_failed');
  });

  it('fails without a valid state — there is no trustworthy return link', async () => {
    const s = setup({ valid: false });
    const result = await s.useCase.execute({ code: 'c', state: 'forged' });
    expect(!result.ok && result.failure.messageKey).toBe('errors.instagram.state_invalid');
    expect(s.graph.exchangeCode).not.toHaveBeenCalled();
  });
});

describe('GetInstagramConnectionUseCase / DisconnectInstagramUseCase', () => {
  it('answers the link without its token, and connected:false once disconnected', async () => {
    const connections = new InMemoryInstagramConnections().seed(connection());
    const get = new GetInstagramConnectionUseCase(connections, true);
    const linked = await get.execute(USER);
    expect(linked.ok && linked.value).toEqual({
      connected: true, available: true, username: 'ada.cooks', igUserId: IG_USER, status: 'active',
      tokenExpiresAt: new Date(NOW.getTime() + 50 * DAY).toISOString(), connectedAt: new Date(NOW.getTime() - 10 * DAY).toISOString(),
    });
    expect(JSON.stringify(linked)).not.toContain('token-1');
    await new DisconnectInstagramUseCase(connections).execute(USER);
    const after = await get.execute(USER);
    expect(after.ok && after.value).toMatchObject({ connected: false, username: null, status: null });
  });
});

describe('RefreshInstagramTokensUseCase', () => {
  it('refreshes tokens with under 7 days left, expires lapsed and refused ones', async () => {
    const graph = fakeGraph();
    const connections = new InMemoryInstagramConnections().seed(
      connection({ userId: 'u-soon', igUserId: '1', tokenExpiresAt: new Date(NOW.getTime() + 3 * DAY) }),
      connection({ userId: 'u-fine', igUserId: '2', tokenExpiresAt: new Date(NOW.getTime() + 30 * DAY) }),
      connection({ userId: 'u-lapsed', igUserId: '3', tokenExpiresAt: new Date(NOW.getTime() - DAY) }),
      connection({ userId: 'u-revoked', igUserId: '4', accessToken: 'revoked', tokenExpiresAt: new Date(NOW.getTime() + 2 * DAY) }),
    );
    graph.refresh.mockImplementation(async (token: string) =>
      token === 'revoked' ? fail(new UnauthorizedFailure('errors.instagram.token_invalid')) : ok({ accessToken: 'fresh', expiresInSeconds: 60 * 24 * 3600 }),
    );
    const result = await new RefreshInstagramTokensUseCase(graph, connections, { warn: jest.fn() }, () => NOW).execute();
    expect(result).toEqual({ ok: true, value: { refreshed: 1, expired: 2, failed: 0 } });
    expect(connections.rows.get('u-soon')?.accessToken).toBe('fresh');
    expect(connections.rows.get('u-fine')?.accessToken).toBe('token-1');
    expect(connections.rows.get('u-lapsed')?.status).toBe('expired');
    expect(connections.rows.get('u-revoked')?.status).toBe('expired');
  });

  it('idles without an Instagram app', async () => {
    const result = await new RefreshInstagramTokensUseCase(null, new InMemoryInstagramConnections(), { warn: jest.fn() }).execute();
    expect(result).toEqual({ ok: true, value: { refreshed: 0, expired: 0, failed: 0 } });
  });
});

describe('ListInstagramMediaUseCase', () => {
  function setup() {
    const graph = fakeGraph();
    const cursors = new Map<string, string | null>();
    const cache = { get: (k: string) => cursors.get(k), set: (k: string, v: string | null) => void cursors.set(k, v) };
    graph.profile.mockResolvedValue(ok({ igUserId: IG_USER, username: 'ada.cooks', mediaCount: 5 }));
    graph.listMedia.mockImplementation(async (_t: string, _limit: number, after: string | null) => {
      const pages: Record<string, { items: ReturnType<typeof media>[]; after: string | null }> = {
        start: { items: [media({ id: 'm1' }), media({ id: 'm2' })], after: 'c2' },
        c2: { items: [media({ id: 'm3' }), media({ id: 'm4' })], after: 'c3' },
        c3: { items: [media({ id: 'm5' })], after: null },
      };
      return ok(pages[after ?? 'start']);
    });
    const useCase = new ListInstagramMediaUseCase(graph, new InMemoryInstagramConnections().seed(connection()), cache, () => NOW);
    return { graph, useCase };
  }

  it('answers a page by number, walking the cursors once and remembering them', async () => {
    const { graph, useCase } = setup();
    const page3 = await useCase.execute({ userId: USER, page: 3, pageSize: 2 });
    expect(page3.ok && page3.value.items.map((m) => m.id)).toEqual(['m5']);
    expect(page3.ok && [page3.value.total, page3.value.page, page3.value.pageSize]).toEqual([5, 3, 2]);
    expect(graph.listMedia).toHaveBeenCalledTimes(3);
    graph.listMedia.mockClear();
    const page2 = await useCase.execute({ userId: USER, page: 2, pageSize: 2 });
    expect(page2.ok && page2.value.items.map((m) => m.id)).toEqual(['m3', 'm4']);
    expect(graph.listMedia).toHaveBeenCalledTimes(1);
    expect(graph.listMedia).toHaveBeenCalledWith('token-1', 2, 'c2');
  });

  it('answers an empty page past the end', async () => {
    const { useCase } = setup();
    const page5 = await useCase.execute({ userId: USER, page: 5, pageSize: 2 });
    expect(page5.ok && page5.value).toEqual({ items: [], total: 5, page: 5, pageSize: 2 });
  });

  it('maps media for the wire', async () => {
    const { useCase } = setup();
    const page1 = await useCase.execute({ userId: USER, page: 1, pageSize: 2 });
    expect(page1.ok && page1.value.items[0]).toEqual({
      id: 'm1', mediaType: 'VIDEO', thumbnailUrl: 'https://cdn/x.jpg', caption: 'Menemen', permalink: 'https://instagram.com/p/x', timestamp: NOW.toISOString(),
    });
  });

  it('answers not_connected without a usable connection', async () => {
    const result = await new ListInstagramMediaUseCase(fakeGraph(), new InMemoryInstagramConnections(), { get: () => undefined, set: () => undefined }).execute({ userId: USER, page: 1, pageSize: 20 });
    expect(!result.ok && [result.failure.code, result.failure.messageKey]).toEqual(['conflict', 'errors.instagram.not_connected']);
  });
});
