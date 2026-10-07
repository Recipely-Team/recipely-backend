import { DmRule } from '@domain/instagram/dm-rule';
import { fail, ok } from '@core/result/result';
import { ForbiddenFailure, NotFoundFailure, ServiceUnavailableFailure, TooManyRequestsFailure, UnauthorizedFailure, UnknownFailure, UnprocessableFailure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import { ReceiveInstagramWebhookUseCase } from '@application/instagram/delivery/receive-instagram-webhook-use-case';
import { MAX_EVENT_ATTEMPTS, ProcessInstagramEventsUseCase } from '@application/instagram/delivery/process-instagram-events-use-case';
import { DeleteInstagramDataUseCase } from '@application/instagram/delivery/delete-instagram-data-use-case';
import {
  APP_SCOPED_ID,
  IG_USER,
  InMemoryDmRules,
  InMemoryDmSends,
  InMemoryEventQueue,
  InMemoryInstagramConnections,
  NOW,
  RECIPE,
  USER,
  commentWebhook,
  connection,
  fakeGraph,
  rule,
} from '../../fixtures/instagram-fakes';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function setup(opts: { recipePublic?: boolean; conn?: ReturnType<typeof connection>; rules?: ReturnType<typeof rule>[] } = {}) {
  const queue = new InMemoryEventQueue();
  const connections = new InMemoryInstagramConnections().seed(opts.conn ?? connection());
  const rules = new InMemoryDmRules().seed(...(opts.rules ?? [rule()]));
  const sends = new InMemoryDmSends();
  const recipes = {
    getById: jest.fn().mockResolvedValue(opts.recipePublic === false ? fail(new NotFoundFailure('errors.not_found.recipe')) : ok({})),
  } as unknown as RecipeRepositoryInterface & { getById: jest.Mock };
  const graph = fakeGraph();
  const logger = { warn: jest.fn() };
  let clock = NOW;
  const process = new ProcessInstagramEventsUseCase(queue, connections, rules, sends, recipes, graph, logger, 'https://recipely.net', () => clock);
  const receive = new ReceiveInstagramWebhookUseCase(queue);
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { queue, connections, rules, sends, recipes, graph, logger, process, receive, advance };
}

describe('ReceiveInstagramWebhookUseCase', () => {
  it('queues each comment change with its account and time', async () => {
    const s = setup();
    const count = await s.receive.execute(commentWebhook());
    expect(count).toEqual({ ok: true, value: 1 });
    expect(s.queue.events[0]).toMatchObject({ igUserId: IG_USER, field: 'comments', eventTime: NOW, payload: { id: 'comment-1' }, dedupeKey: 'comments:comment-1' });
  });

  it.each([
    ['another object', { object: 'page', entry: [] }],
    ['another field', { object: 'instagram', entry: [{ id: IG_USER, time: 1, changes: [{ field: 'messages', value: {} }] }] }],
    ['garbage', 'nope'],
    ['no entry', { object: 'instagram' }],
  ])('acknowledges %s with nothing queued', async (_label, payload) => {
    const s = setup();
    expect(await s.receive.execute(payload)).toEqual({ ok: true, value: 0 });
    expect(s.queue.events).toHaveLength(0);
  });
});

describe('ProcessInstagramEventsUseCase', () => {
  const run = async (s: ReturnType<typeof setup>, payload: unknown = commentWebhook()) => {
    await s.receive.execute(payload);
    return s.process.execute();
  };

  it('never sends a stored rule whose text carries a foreign link', async () => {
    const base = rule();
    const legacy = DmRule.restore({
      id: base.id, userId: base.userId, mediaId: base.mediaId, media: base.media, keywords: base.keywords,
      recipeId: base.recipeId, dmText: 'Tarif: https://old.example', publicReplyText: null, enabled: true,
      enabledAt: base.enabledAt, createdAt: base.createdAt, updatedAt: base.updatedAt,
    });
    if (!legacy.ok) throw new Error('fixture');
    const s = setup({ rules: [legacy.value] });
    await run(s);
    expect(s.graph.sendPrivateReply).not.toHaveBeenCalled();
  });

  it('sends one private reply with the DM filled in, and records it', async () => {
    const s = setup();
    const result = await run(s);
    expect(result).toEqual({ ok: true, value: { processed: 1, sent: 1, retried: 0 } });
    expect(s.graph.sendPrivateReply).toHaveBeenCalledWith(
      IG_USER, 'token-1', 'comment-1', `Selam meraklı_aşçı! Tarif burada: https://recipely.net/recipes/${RECIPE}`,
      null,
    );
    expect(s.sends.only()).toMatchObject({ status: 'sent', reason: null, sentAt: NOW, commentText: 'Tarif lütfen!' });
    expect(s.queue.events[0]?.status).toBe('done');
    expect(s.recipes.getById).toHaveBeenCalledWith(RECIPE);
  });

  it('also replies publicly when the rule says so, without failing the send if that fails', async () => {
    const s = setup({ rules: [rule({ publicReplyText: 'DM attım 💌' })] });
    s.graph.replyToComment.mockResolvedValueOnce(fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed')));
    await run(s);
    expect(s.graph.replyToComment).toHaveBeenCalledWith('token-1', 'comment-1', 'DM attım 💌');
    expect(s.sends.only()).toMatchObject({ status: 'sent', publicReplied: false });
  });

  // Meta redelivers webhooks; Instagram allows one private reply per comment.
  it('never answers the same comment twice', async () => {
    const s = setup();
    await run(s);
    await run(s);
    expect(s.graph.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(s.sends.rows.size).toBe(1);
  });

  it.each([
    ['a comment that matches no keyword', { text: 'çok güzel olmuş' }],
    ['the creator\'s own comment (by id)', { fromId: IG_USER }],
    ['the creator\'s own comment (by username)', { fromUsername: 'ADA.COOKS' }],
    ['a post without a rule', { mediaId: 'other-media' }],
    ['an account not linked here', { igUserId: '999' }],
  ])('ignores %s', async (_label, overrides) => {
    const s = setup();
    const result = await run(s, commentWebhook(overrides));
    expect(result.ok && result.value.sent).toBe(0);
    expect(s.graph.sendPrivateReply).not.toHaveBeenCalled();
    expect(s.sends.rows.size).toBe(0);
    expect(s.queue.events[0]?.status).toBe('done');
  });

  it('ignores a disabled rule', async () => {
    const s = setup({ rules: [rule({ enabled: false })] });
    await run(s);
    expect(s.graph.sendPrivateReply).not.toHaveBeenCalled();
  });

  it('uses the first matching rule when several cover the post', async () => {
    const s = setup({ rules: [rule({ id: 'r-a', keywords: ['menemen'] }), rule({ id: 'r-b', keywords: ['tarif'] })] });
    await run(s);
    expect(s.sends.only().ruleId).toBe('r-b');
  });

  it.each([
    ['a comment over 7 days old', { time: Math.floor((NOW.getTime() - 8 * DAY) / 1000) }, {}, 'too_old'],
    ['a recipe others cannot open', {}, { recipePublic: false }, 'recipe_unavailable'],
    ['an expired connection', {}, { conn: connection({ status: InstagramConnectionStatus.Expired }) }, 'not_connected'],
  ] as const)('records %s as failed without asking Instagram', async (_label, webhook, opts, reason) => {
    const s = setup(opts);
    await run(s, commentWebhook(webhook));
    expect(s.graph.sendPrivateReply).not.toHaveBeenCalled();
    expect(s.sends.only()).toMatchObject({ status: 'failed', reason });
  });

  it.each([
    ['a recipient who cannot be messaged', new UnprocessableFailure('errors.instagram.recipient_unavailable'), 'recipient_unavailable'],
    ['any other refusal', new ServiceUnavailableFailure('errors.instagram.upstream_failed'), 'upstream_error'],
  ])('records %s', async (_label, failure, reason) => {
    const s = setup();
    s.graph.sendPrivateReply.mockResolvedValue(fail(failure));
    await run(s);
    expect(s.sends.only()).toMatchObject({ status: 'failed', reason });
    expect(s.queue.events[0]?.status).toBe('done');
  });

  it('expires the connection when Instagram refuses its token', async () => {
    const s = setup();
    s.graph.sendPrivateReply.mockResolvedValue(fail(new UnauthorizedFailure('errors.instagram.token_invalid')));
    await run(s);
    expect(s.connections.rows.get(USER)?.status).toBe('expired');
    expect(s.sends.only()).toMatchObject({ status: 'failed', reason: 'not_connected' });
  });

  it('backs off on a rate limit, keeps the attempt pending, and sends on a later tick', async () => {
    const s = setup();
    s.graph.sendPrivateReply.mockResolvedValueOnce(fail(new TooManyRequestsFailure('errors.instagram.rate_limited')));
    const first = await run(s);
    expect(first.ok && first.value).toEqual({ processed: 1, sent: 0, retried: 1 });
    expect(s.sends.only().status).toBe('pending');
    expect(s.queue.events[0]?.availableAt).toEqual(new Date(NOW.getTime() + MINUTE));

    expect((await s.process.execute()).ok && s.graph.sendPrivateReply).toHaveBeenCalledTimes(1); // not due yet
    s.advance(MINUTE);
    const second = await s.process.execute();
    expect(second.ok && second.value.sent).toBe(1);
    expect(s.sends.only().status).toBe('sent');
  });

  it(`gives up on a rate limit after ${MAX_EVENT_ATTEMPTS} attempts, recording rate_limited`, async () => {
    const s = setup();
    s.graph.sendPrivateReply.mockResolvedValue(fail(new TooManyRequestsFailure('errors.instagram.rate_limited')));
    await s.receive.execute(commentWebhook());
    for (let i = 0; i < MAX_EVENT_ATTEMPTS; i += 1) {
      await s.process.execute();
      s.advance(60 * MINUTE);
    }
    expect(s.graph.sendPrivateReply).toHaveBeenCalledTimes(MAX_EVENT_ATTEMPTS);
    expect(s.sends.only()).toMatchObject({ status: 'failed', reason: 'rate_limited' });
    expect(s.queue.events[0]?.status).toBe('failed');
  });

  // A send claimed before the store failed must not sit at pending forever.
  it('closes a claimed attempt as upstream_error when its event runs out of retries', async () => {
    const s = setup();
    s.recipes.getById.mockResolvedValue(fail(new UnknownFailure('db down')));
    await s.receive.execute(commentWebhook());
    for (let i = 0; i < MAX_EVENT_ATTEMPTS; i += 1) {
      await s.process.execute();
      s.advance(60 * MINUTE);
    }
    expect(s.sends.only()).toMatchObject({ status: 'failed', reason: 'upstream_error' });
    expect(s.queue.events[0]?.status).toBe('failed');
  });

  it('records a missing messaging permission without expiring the connection', async () => {
    const s = setup();
    s.graph.sendPrivateReply.mockResolvedValue(fail(new ForbiddenFailure('errors.instagram.permission_missing')));
    await run(s);
    expect(s.sends.only()).toMatchObject({ status: 'failed', reason: 'permission_missing' });
    expect(s.connections.rows.get(USER)?.status).toBe('active');
  });

  it('retries the event when the store fails, and fails it after the last attempt', async () => {
    const s = setup();
    jest.spyOn(s.connections, 'findByIgUserId').mockResolvedValue(fail(new UnknownFailure('db down')));
    await s.receive.execute(commentWebhook());
    for (let i = 0; i < MAX_EVENT_ATTEMPTS; i += 1) {
      await s.process.execute();
      s.advance(60 * MINUTE);
    }
    expect(s.queue.events[0]).toMatchObject({ status: 'failed', lastError: 'db down' });
  });

  it('prunes finished events older than a week, once an hour', async () => {
    const s = setup();
    await s.process.execute();
    await s.process.execute();
    expect(s.queue.pruned).toEqual([new Date(NOW.getTime() - 7 * DAY)]);
    s.advance(60 * MINUTE);
    await s.process.execute();
    expect(s.queue.pruned).toHaveLength(2);
  });

  // A follower's comment text and username were kept on every send record forever.
  it('forgets commenters\' words and usernames after 30 days, with the hourly prune', async () => {
    const s = setup();
    await s.process.execute();
    expect(s.sends.scrubbedBefore).toEqual([new Date(NOW.getTime() - 30 * DAY)]);
  });
});

describe('DeleteInstagramDataUseCase', () => {
  it('data deletion erases the user\'s link, rules and history', async () => {
    const connections = new InMemoryInstagramConnections().seed(connection());
    await new DeleteInstagramDataUseCase(connections).execute({ igUserId: IG_USER, everything: true });
    expect(connections.purged).toEqual([USER]);
  });

  it('matches the account by the app-scoped id too', async () => {
    const connections = new InMemoryInstagramConnections().seed(connection());
    await new DeleteInstagramDataUseCase(connections).execute({ igUserId: APP_SCOPED_ID, everything: true });
    expect(connections.purged).toEqual([USER]);
  });

  it('deauthorize forgets only the link', async () => {
    const connections = new InMemoryInstagramConnections().seed(connection());
    await new DeleteInstagramDataUseCase(connections).execute({ igUserId: IG_USER, everything: false });
    expect([connections.rows.has(USER), connections.purged]).toEqual([false, []]);
  });

  it('succeeds for an account never linked here', async () => {
    expect((await new DeleteInstagramDataUseCase(new InMemoryInstagramConnections()).execute({ igUserId: '1', everything: true })).ok).toBe(true);
  });
});
