import { InstagramGraphClient, type GraphFetch } from '@infrastructure/instagram/instagram-graph-client';
import { pinoInstance } from '@infrastructure/logger/pino-logger';

const config = { appId: 'app-1', appSecret: 'shh', redirectUri: 'https://dev-api.recipely.net/auth/instagram/callback' };
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(...answers: Array<Response | Error>): { graph: InstagramGraphClient; fetch: jest.Mock } {
  const fetch = jest.fn<ReturnType<GraphFetch>, Parameters<GraphFetch>>();
  for (const a of answers) {
    if (a instanceof Error) fetch.mockRejectedValueOnce(a);
    else fetch.mockResolvedValueOnce(a);
  }
  return { graph: new InstagramGraphClient(config, fetch as unknown as GraphFetch), fetch };
}

const call = (fetch: jest.Mock, i = 0) => ({ url: new URL(fetch.mock.calls[i][0] as string), init: fetch.mock.calls[i][1] as RequestInit });

beforeEach(() => jest.spyOn(pinoInstance, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('InstagramGraphClient — login', () => {
  it('builds the instagram.com consent URL with the three business scopes and the state', () => {
    const url = new URL(client().graph.authorizeUrl('st8'));
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'app-1',
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages',
      state: 'st8',
    });
  });

  it.each([
    ['flat', { access_token: 'short', user_id: 17 }],
    ['wrapped in data', { data: [{ access_token: 'short', user_id: 17 }] }],
  ])('exchanges the code (answer %s)', async (_label, body) => {
    const { graph, fetch } = client(json(body));
    expect(await graph.exchangeCode('c0de')).toEqual({ ok: true, value: { accessToken: 'short' } });
    const { url, init } = call(fetch);
    expect(url.toString()).toBe('https://api.instagram.com/oauth/access_token');
    expect(init.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      client_id: 'app-1', client_secret: 'shh', grant_type: 'authorization_code', redirect_uri: config.redirectUri, code: 'c0de',
    });
  });

  it('upgrades to a long-lived token and refreshes it', async () => {
    const { graph, fetch } = client(json({ access_token: 'long', expires_in: 5183944 }), json({ access_token: 'long2', expires_in: 5183944 }));
    expect(await graph.longLived('short')).toEqual({ ok: true, value: { accessToken: 'long', expiresInSeconds: 5183944 } });
    expect(Object.fromEntries(call(fetch).url.searchParams)).toEqual({ grant_type: 'ig_exchange_token', client_secret: 'shh', access_token: 'short' });
    expect(await graph.refresh('long')).toEqual({ ok: true, value: { accessToken: 'long2', expiresInSeconds: 5183944 } });
    expect(call(fetch, 1).url.pathname).toBe('/refresh_access_token');
  });

  it('reads the profile with the token in the Authorization header, not the URL', async () => {
    const { graph, fetch } = client(json({ id: 'app-scoped', user_id: '17841', username: 'ada.cooks', media_count: 12, followers_count: 4310 }));
    expect(await graph.profile('tok')).toEqual({ ok: true, value: { igUserId: '17841', appScopedId: 'app-scoped', username: 'ada.cooks', mediaCount: 12, followersCount: 4310 } });
    expect(call(fetch).url.searchParams.get('fields')).toContain('followers_count');
    const { url, init } = call(fetch);
    expect(url.searchParams.get('access_token')).toBeNull();
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
});

describe('InstagramGraphClient — media and messages', () => {
  it('lists media, using a video\'s thumbnail, with the next cursor only when there is a next page', async () => {
    const { graph, fetch } = client(
      json({
        data: [
          { id: 'm1', media_type: 'VIDEO', media_url: 'https://v.mp4', thumbnail_url: 'https://t.jpg', caption: 'Reel', permalink: 'https://p/1', timestamp: '2026-10-01T10:00:00+0000' },
          { id: 'm2', media_type: 'IMAGE', media_url: 'https://i.jpg', permalink: 'https://p/2' },
        ],
        paging: { cursors: { after: 'AFTER' }, next: 'https://graph.instagram.com/next' },
      }),
      json({ data: [], paging: { cursors: { after: 'X' } } }),
    );
    const page = await graph.listMedia('tok', 2, 'BEFORE');
    expect(page.ok && page.value.after).toBe('AFTER');
    expect(page.ok && page.value.items.map((m) => [m.id, m.thumbnailUrl, m.caption])).toEqual([['m1', 'https://t.jpg', 'Reel'], ['m2', 'https://i.jpg', null]]);
    expect(page.ok && page.value.items[0]?.timestamp?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(Object.fromEntries(call(fetch).url.searchParams)).toMatchObject({ limit: '2', after: 'BEFORE' });
    const last = await graph.listMedia('tok', 2, 'AFTER');
    expect(last.ok && last.value.after).toBeNull();
  });

  // `thumbnail_url` exists only for videos: images and albums must use `media_url`,
  // and an album without one its first child's — otherwise the grid is empty tiles.
  it('gives every kind of post a picture', async () => {
    const { graph } = client(
      json({
        data: [
          { id: 'img', media_type: 'IMAGE', media_url: 'https://img.jpg' },
          { id: 'vid', media_type: 'VIDEO', media_url: 'https://v.mp4', thumbnail_url: 'https://thumb.jpg' },
          { id: 'album', media_type: 'CAROUSEL_ALBUM', media_url: 'https://cover.jpg', children: { data: [{ media_url: 'https://c1.jpg' }] } },
          { id: 'bare-album', media_type: 'CAROUSEL_ALBUM', children: { data: [{ media_type: 'VIDEO', media_url: 'https://c.mp4', thumbnail_url: 'https://c-thumb.jpg' }] } },
          { id: 1234567, media_type: 'IMAGE', media_url: 'https://n.jpg' },
        ],
      }),
    );
    const page = await graph.listMedia('tok', 9, null);
    expect(page.ok && page.value.items.map((m) => [m.id, m.thumbnailUrl])).toEqual([
      ['img', 'https://img.jpg'],
      ['vid', 'https://thumb.jpg'],
      ['album', 'https://cover.jpg'],
      ['bare-album', 'https://c-thumb.jpg'],
      ['1234567', 'https://n.jpg'],
    ]);
  });

  it('asks for album children with the media fields', async () => {
    const { graph, fetch } = client(json({ data: [] }));
    await graph.listMedia('tok', 9, null);
    expect(call(fetch).url.searchParams.get('fields')).toContain('children{media_type,media_url,thumbnail_url}');
  });

  it('reads a post\'s comments with their author and time', async () => {
    const { graph, fetch } = client(
      json({
        data: [
          { id: 'c2', text: 'Tarif!', timestamp: '2026-10-02T11:59:00+0000', from: { id: '9001', username: 'ayse' } },
          { id: 'c-no-text', timestamp: '2026-10-02T11:58:00+0000' },
        ],
        paging: { cursors: { after: 'A' }, next: 'https://graph.instagram.com/next' },
      }),
    );
    const page = await graph.listComments('tok', 'm1', 50, null);
    expect(page.ok && page.value).toEqual({
      items: [{ id: 'c2', text: 'Tarif!', timestamp: new Date('2026-10-02T11:59:00Z'), fromId: '9001', fromUsername: 'ayse' }],
      after: 'A',
    });
    const { url, init } = call(fetch);
    expect(url.pathname).toBe('/v23.0/m1/comments');
    expect(Object.fromEntries(url.searchParams)).toEqual({ fields: 'id,text,timestamp,from{id,username}', limit: '50' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('answers null for a post that is not the account\'s', async () => {
    const { graph } = client(json({ error: { code: 100, message: 'Unsupported get request' } }, 400));
    expect(await graph.findMedia('tok', 'x')).toEqual({ ok: true, value: null });
  });

  it('sends a private reply to the commenter by comment id', async () => {
    const { graph, fetch } = client(json({ recipient_id: '9', message_id: 'mid' }));
    expect((await graph.sendPrivateReply('17841', 'tok', 'c1', 'Hi!')).ok).toBe(true);
    const { url, init } = call(fetch);
    expect(url.toString()).toBe('https://graph.instagram.com/v23.0/17841/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ recipient: { comment_id: 'c1' }, message: { text: 'Hi!' } });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('replies publicly under the comment', async () => {
    const { graph, fetch } = client(json({ id: 'reply-1' }));
    expect((await graph.replyToComment('tok', 'c1', 'DM attım')).ok).toBe(true);
    const { url } = call(fetch);
    expect(url.pathname).toBe('/v23.0/c1/replies');
    expect(url.searchParams.get('message')).toBe('DM attım');
  });
});

describe('InstagramGraphClient — refusals', () => {
  it.each([
    ['HTTP 429', json({}, 429), 'too_many_requests', 'errors.instagram.rate_limited'],
    ['code 4 (app rate limit)', json({ error: { code: 4 } }, 400), 'too_many_requests', 'errors.instagram.rate_limited'],
    ['code 613', json({ error: { code: 613 } }, 400), 'too_many_requests', 'errors.instagram.rate_limited'],
    ['code 190 (token)', json({ error: { code: 190, type: 'OAuthException' } }, 400), 'unauthorized', 'errors.instagram.token_invalid'],
    // A missing permission must not expire the connection: only token codes do.
    ['code 10 (permission)', json({ error: { code: 10 } }, 400), 'forbidden', 'errors.instagram.permission_missing'],
    ['code 200 (permission)', json({ error: { code: 200 } }, 400), 'forbidden', 'errors.instagram.permission_missing'],
    ['code 463 (token expired)', json({ error: { code: 463 } }, 400), 'unauthorized', 'errors.instagram.token_invalid'],
    ['code 551 (person unavailable)', json({ error: { code: 551 } }, 400), 'unprocessable', 'errors.instagram.recipient_unavailable'],
    ['subcode 2534022 (outside the window)', json({ error: { code: 10, error_subcode: 2534022 } }, 400), 'unprocessable', 'errors.instagram.recipient_unavailable'],
    ['anything else', json({ error: { code: 1 } }, 500), 'service_unavailable', 'errors.instagram.upstream_failed'],
    ['a network error', new Error('ECONNRESET'), 'service_unavailable', 'errors.instagram.upstream_failed'],
  ])('classifies %s', async (_label, answer, code, key) => {
    const { graph } = client(answer);
    const result = await graph.sendPrivateReply('1', 'tok', 'c', 't');
    expect(!result.ok && [result.failure.code, result.failure.messageKey]).toEqual([code, key]);
  });

  it('never logs the token', async () => {
    const warn = pinoInstance.warn as unknown as jest.Mock;
    const { graph } = client(json({ error: { code: 190 } }, 400));
    await graph.profile('SUPER-SECRET-TOKEN');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SUPER-SECRET-TOKEN');
  });
});
