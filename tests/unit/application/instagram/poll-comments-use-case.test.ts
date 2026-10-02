import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure, TooManyRequestsFailure, UnauthorizedFailure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { InstagramCommentData } from '@application/instagram/ports/instagram-graph-interface';
import type { CommentPollCursorInterface, CommentPollTarget } from '@application/instagram/ports/comment-poll-cursor-interface';
import { POLL_MEDIA_PER_TICK, PollInstagramCommentsUseCase } from '@application/instagram/delivery/poll-instagram-comments-use-case';
import { ProcessInstagramEventsUseCase } from '@application/instagram/delivery/process-instagram-events-use-case';
import { ReceiveInstagramWebhookUseCase } from '@application/instagram/delivery/receive-instagram-webhook-use-case';
import {
  IG_USER, InMemoryDmRules, InMemoryDmSends, InMemoryEventQueue, InMemoryInstagramConnections, MEDIA, NOW, USER,
  commentWebhook, connection, fakeGraph, rule,
} from '../../fixtures/instagram-fakes';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const comment = (overrides: Partial<InstagramCommentData> = {}): InstagramCommentData => ({
  id: 'comment-1', text: 'Tarif lütfen!', timestamp: at(-MINUTE), fromId: '9001', fromUsername: 'meraklı_aşçı', ...overrides,
});

class FakeCursors implements CommentPollCursorInterface {
  targets: CommentPollTarget[] = [{ userId: USER, mediaId: MEDIA, since: at(-10 * MINUTE) }];
  advanced: Array<[string, string, Date, Date]> = [];
  async listDue(_now: Date, limit: number) {
    return ok(this.targets.slice(0, limit));
  }
  async advance(mediaId: string, igUserId: string, lastSeenAt: Date, polledAt: Date) {
    this.advanced.push([mediaId, igUserId, lastSeenAt, polledAt]);
    return ok(undefined);
  }
}

function setup(conn = connection()) {
  const graph = fakeGraph();
  const cursors = new FakeCursors();
  const connections = new InMemoryInstagramConnections().seed(conn);
  const queue = new InMemoryEventQueue();
  const logger = { warn: jest.fn() };
  let clock = NOW;
  const poll = new PollInstagramCommentsUseCase(graph, cursors, connections, queue, logger, () => clock);
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { graph, cursors, connections, queue, logger, poll, advance };
}

describe('PollInstagramCommentsUseCase', () => {
  it('queues each new comment in the webhook\'s own shape and advances the cursor to the newest', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(ok({ items: [comment({ id: 'c2', timestamp: at(-MINUTE) }), comment({ id: 'c1', timestamp: at(-2 * MINUTE) })], after: null }));
    const result = await s.poll.execute();
    expect(result).toEqual({ ok: true, value: { polled: 1, queued: 2 } });
    expect(s.graph.listComments).toHaveBeenCalledWith('token-1', MEDIA, 50, null);
    expect(s.queue.events[0]).toMatchObject({
      igUserId: IG_USER, field: 'comments', eventTime: at(-MINUTE),
      payload: { id: 'c2', text: 'Tarif lütfen!', from: { id: '9001', username: 'meraklı_aşçı' }, media: { id: MEDIA } },
    });
    expect(s.cursors.advanced).toEqual([[MEDIA, IG_USER, at(-MINUTE), NOW]]);
  });

  it('skips comments before the cursor, older than 7 days, and the creator\'s own', async () => {
    const s = setup();
    s.cursors.targets = [{ userId: USER, mediaId: MEDIA, since: at(-30 * DAY) }];
    s.graph.listComments.mockResolvedValue(ok({
      items: [
        comment({ id: 'own-id', fromId: IG_USER }),
        comment({ id: 'own-name', fromId: 'x', fromUsername: 'ADA.COOKS' }),
        comment({ id: 'fresh', timestamp: at(-DAY) }),
        comment({ id: 'stale', timestamp: at(-8 * DAY) }),
      ],
      after: 'MORE',
    }));
    await s.poll.execute();
    expect(s.queue.events.map((e) => (e.payload as { id: string }).id)).toEqual(['fresh']);
    // The page reached back past the 7-day floor, so the read stopped there.
    expect(s.graph.listComments).toHaveBeenCalledTimes(1);
  });

  it('reads further pages while they are all new, at most three', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(ok({ items: [comment({ timestamp: at(-MINUTE) })], after: 'NEXT' }));
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenCalledTimes(3);
    expect(s.graph.listComments).toHaveBeenLastCalledWith('token-1', MEDIA, 50, 'NEXT');
  });

  it('keeps the cursor where it was when nothing is new', async () => {
    const s = setup();
    await s.poll.execute();
    expect(s.queue.events).toHaveLength(0);
    expect(s.cursors.advanced[0]?.[2]).toEqual(new Date(at(-10 * MINUTE).getTime() - 1));
  });

  it(`reads at most ${POLL_MEDIA_PER_TICK} posts a tick`, async () => {
    const s = setup();
    s.cursors.targets = Array.from({ length: 30 }, (_, i) => ({ userId: USER, mediaId: `m${i}`, since: NOW }));
    const result = await s.poll.execute();
    expect(result.ok && result.value.polled).toBe(POLL_MEDIA_PER_TICK);
  });

  it('rests on a rate limit, doubling the rest, and resumes after it', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(fail(new TooManyRequestsFailure('errors.instagram.rate_limited')));
    await s.poll.execute();
    expect(s.cursors.advanced).toHaveLength(0);
    s.advance(30 * 1000);
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenCalledTimes(1); // resting
    s.advance(MINUTE);
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenCalledTimes(2);
    expect(s.logger.warn).toHaveBeenLastCalledWith({ minutes: 2 }, 'instagram_comment_poll_rate_limited');
    s.graph.listComments.mockResolvedValue(ok({ items: [], after: null }));
    s.advance(2 * MINUTE);
    expect((await s.poll.execute()).ok && s.cursors.advanced).toHaveLength(1);
  });

  it('expires a connection whose token Instagram refuses', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(fail(new UnauthorizedFailure('errors.instagram.token_invalid')));
    await s.poll.execute();
    expect(s.connections.rows.get(USER)?.status).toBe('expired');
  });

  it('skips a post Instagram fails on, until its next turn', async () => {
    const s = setup();
    s.cursors.targets = [{ userId: USER, mediaId: 'bad', since: NOW }, { userId: USER, mediaId: 'good', since: at(-10 * MINUTE) }];
    s.graph.listComments.mockImplementation(async (_t: string, mediaId: string) =>
      mediaId === 'bad' ? fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed')) : ok({ items: [comment()], after: null }),
    );
    const result = await s.poll.execute();
    expect(result.ok && result.value.queued).toBe(1);
    expect(s.cursors.advanced.map((a) => a[0])).toEqual(['good']);
  });

  it('idles without an Instagram app, and skips a connection that is not usable', async () => {
    const idle = await new PollInstagramCommentsUseCase(null, new FakeCursors(), new InMemoryInstagramConnections(), new InMemoryEventQueue(), { warn: jest.fn() }).execute();
    expect(idle).toEqual({ ok: true, value: { polled: 0, queued: 0 } });
    const s = setup(connection({ status: InstagramConnectionStatus.Expired }));
    await s.poll.execute();
    expect(s.graph.listComments).not.toHaveBeenCalled();
  });
});

// Webhook and poller both see the comment once webhooks go live: one DM, not two.
describe('webhook + poller deliver the same comment', () => {
  it('sends exactly one private reply', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(ok({ items: [comment({ id: 'comment-1', timestamp: NOW })], after: null }));
    const rules = new InMemoryDmRules().seed(rule());
    const sends = new InMemoryDmSends();
    const recipes = { getById: jest.fn().mockResolvedValue(ok({})) } as unknown as RecipeRepositoryInterface;
    const worker = new ProcessInstagramEventsUseCase(s.queue, s.connections, rules, sends, recipes, s.graph, { warn: jest.fn() }, 'https://recipely.net', () => NOW);

    await new ReceiveInstagramWebhookUseCase(s.queue, () => NOW).execute(commentWebhook({ commentId: 'comment-1' }));
    await s.poll.execute();
    expect(s.queue.events).toHaveLength(2);
    await worker.execute();

    expect(s.graph.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(sends.rows.size).toBe(1);
    expect(sends.only().status).toBe('sent');
  });
});
