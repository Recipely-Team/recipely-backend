import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure, TooManyRequestsFailure, UnauthorizedFailure, UnknownFailure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import type { InstagramCommentData } from '@application/instagram/ports/instagram-graph-interface';
import type { CommentPollCursorInterface, CommentPollState, CommentPollTarget } from '@application/instagram/ports/comment-poll-cursor-interface';
import {
  PAGES_PER_MEDIA,
  POLL_CALLS_PER_ACCOUNT_HOUR,
  POLL_MEDIA_PER_TICK,
  PollInstagramCommentsUseCase,
} from '@application/instagram/delivery/poll-instagram-comments-use-case';
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

/** Cursors kept like the table: `listDue` answers each post's saved state; `since` = last seen (inclusive). */
class FakeCursors implements CommentPollCursorInterface {
  readonly state = new Map<string, CommentPollState & { since?: Date }>();
  targets: Array<Pick<CommentPollTarget, 'userId' | 'mediaId' | 'since'>> = [{ userId: USER, mediaId: MEDIA, since: at(-10 * MINUTE) }];
  saves: Array<[string, CommentPollState]> = [];
  touches: Array<[string, Date]> = [];

  async listDue(now: Date, limit: number) {
    const due = this.targets.filter((t) => {
      const s = this.state.get(t.mediaId);
      return s?.nextPollAt == null || s.nextPollAt <= now;
    });
    const order = (t: { mediaId: string }) => this.state.get(t.mediaId)?.polledAt.getTime() ?? -1;
    return ok(
      [...due].sort((a, b) => order(a) - order(b)).slice(0, limit).map((t): CommentPollTarget => {
        const s = this.state.get(t.mediaId);
        return {
          ...t,
          since: s === undefined ? t.since : new Date(Math.max(s.lastSeenAt.getTime(), t.since.getTime())),
          resumeAfter: s?.resumeAfter ?? null,
          resumeNewestAt: s?.resumeNewestAt ?? null,
          emptyPolls: s?.emptyPolls ?? 0,
        };
      }),
    );
  }

  async save(mediaId: string, _ig: string, state: CommentPollState) {
    this.saves.push([mediaId, state]);
    this.state.set(mediaId, state);
    return ok(undefined);
  }

  async touch(mediaId: string, _ig: string, since: Date, polledAt: Date) {
    this.touches.push([mediaId, polledAt]);
    const s = this.state.get(mediaId);
    this.state.set(mediaId, { lastSeenAt: since, resumeAfter: null, resumeNewestAt: null, emptyPolls: 0, nextPollAt: null, ...s, polledAt });
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
  const ids = () => queue.events.map((e) => (e.payload as { id: string }).id);
  return { graph, cursors, connections, queue, logger, poll, advance, ids };
}

describe('PollInstagramCommentsUseCase — reading', () => {
  it('queues each new comment in the webhook\'s shape with its dedupe key, and moves the cursor to the newest', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(ok({ items: [comment({ id: 'c2', timestamp: at(-MINUTE) }), comment({ id: 'c1', timestamp: at(-2 * MINUTE) })], after: null }));
    expect(await s.poll.execute()).toEqual({ ok: true, value: { polled: 1, queued: 2 } });
    expect(s.graph.listComments).toHaveBeenCalledWith('token-1', MEDIA, 50, null);
    expect(s.queue.events[0]).toMatchObject({
      igUserId: IG_USER, field: 'comments', eventTime: at(-MINUTE), dedupeKey: 'comments:c2',
      payload: { id: 'c2', text: 'Tarif lütfen!', from: { id: '9001', username: 'meraklı_aşçı' }, media: { id: MEDIA } },
    });
    expect(s.cursors.state.get(MEDIA)).toMatchObject({ lastSeenAt: at(-MINUTE), resumeAfter: null, emptyPolls: 0, nextPollAt: null });
  });

  it('skips comments before the cursor, older than 7 days, and the creator\'s own; a page past the floor ends the read', async () => {
    const s = setup();
    s.cursors.targets = [{ userId: USER, mediaId: MEDIA, since: at(-30 * DAY) }];
    s.graph.listComments.mockResolvedValue(ok({
      items: [comment({ id: 'own-id', fromId: IG_USER }), comment({ id: 'own-name', fromId: 'x', fromUsername: 'ADA.COOKS' }), comment({ id: 'fresh', timestamp: at(-DAY) }), comment({ id: 'stale', timestamp: at(-8 * DAY) })],
      after: 'MORE',
    }));
    await s.poll.execute();
    expect(s.ids()).toEqual(['fresh']);
    expect(s.graph.listComments).toHaveBeenCalledTimes(1);
  });

  // Instagram stamps whole seconds: the cursor's own second is re-read, and
  // the dedupe key drops the comment already queued.
  it('reads a second comment from the same second as the last one queued, queueing each once', async () => {
    const s = setup();
    const second = at(-MINUTE);
    s.graph.listComments.mockResolvedValueOnce(ok({ items: [comment({ id: 'c1', timestamp: second })], after: null }));
    await s.poll.execute();
    expect(s.cursors.state.get(MEDIA)?.lastSeenAt).toEqual(second);
    s.graph.listComments.mockResolvedValueOnce(ok({ items: [comment({ id: 'c2', timestamp: second }), comment({ id: 'c1', timestamp: second })], after: null }));
    const again = await s.poll.execute();
    expect(again.ok && again.value.queued).toBe(1);
    expect(s.queue.events.map((e) => e.dedupeKey)).toEqual(['comments:c1', 'comments:c2']);
  });

  // A burst longer than the page budget: page 4+ used to be skipped forever
  // because the cursor jumped to the newest comment after 3 pages.
  it('resumes a backlog longer than the page budget from Graph\'s cursor, committing the cursor only when read through', async () => {
    const s = setup();
    s.cursors.targets = [{ userId: USER, mediaId: MEDIA, since: at(-DAY) }];
    const pages: Record<string, { items: InstagramCommentData[]; after: string | null }> = {
      top: { items: [comment({ id: 'p1', timestamp: at(-1 * MINUTE) })], after: 'A2' },
      A2: { items: [comment({ id: 'p2', timestamp: at(-2 * MINUTE) })], after: 'A3' },
      A3: { items: [comment({ id: 'p3', timestamp: at(-3 * MINUTE) })], after: 'A4' },
      A4: { items: [comment({ id: 'p4', timestamp: at(-4 * MINUTE) })], after: 'A5' },
      A5: { items: [comment({ id: 'p5', timestamp: at(-5 * MINUTE) })], after: null },
    };
    s.graph.listComments.mockImplementation(async (_t: string, _m: string, _l: number, after: string | null) => ok(pages[after ?? 'top']));

    await s.poll.execute();
    expect(s.ids()).toEqual(['p1', 'p2', 'p3']);
    expect(s.cursors.state.get(MEDIA)).toMatchObject({ lastSeenAt: at(-DAY), resumeAfter: 'A4', resumeNewestAt: at(-MINUTE), nextPollAt: null });

    s.advance(MINUTE);
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenLastCalledWith('token-1', MEDIA, 50, 'A5');
    expect(s.ids()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(s.cursors.state.get(MEDIA)).toMatchObject({ lastSeenAt: at(-MINUTE), resumeAfter: null, resumeNewestAt: null });
    expect(PAGES_PER_MEDIA).toBe(3);
  });

  it('does not end the read early on a page that comes oldest first', async () => {
    const s = setup();
    s.cursors.targets = [{ userId: USER, mediaId: MEDIA, since: at(-DAY) }];
    s.graph.listComments
      .mockResolvedValueOnce(ok({ items: [comment({ id: 'old', timestamp: at(-2 * DAY) }), comment({ id: 'mid', timestamp: at(-2 * MINUTE) })], after: 'NEXT' }))
      .mockResolvedValueOnce(ok({ items: [comment({ id: 'newest', timestamp: at(-MINUTE) })], after: null }));
    await s.poll.execute();
    expect(s.ids()).toEqual(['mid', 'newest']);
    expect(s.logger.warn).toHaveBeenCalledWith({ mediaId: MEDIA }, 'instagram_comment_order_unexpected');
  });

  it(`reads at most ${POLL_MEDIA_PER_TICK} posts a tick`, async () => {
    const s = setup();
    s.cursors.targets = Array.from({ length: 30 }, (_, i) => ({ userId: USER, mediaId: `m${i}`, since: NOW }));
    const result = await s.poll.execute();
    expect(result.ok && result.value.polled).toBe(POLL_MEDIA_PER_TICK);
  });
});

describe('PollInstagramCommentsUseCase — pacing', () => {
  it('never puts a post to sleep while its backlog is still being read', async () => {
    const s = setup();
    s.cursors.state.set(MEDIA, { lastSeenAt: at(-DAY), polledAt: at(-MINUTE), resumeAfter: null, resumeNewestAt: null, emptyPolls: 5, nextPollAt: null });
    s.cursors.targets = [{ userId: USER, mediaId: MEDIA, since: at(-DAY) }];
    // Three full pages of comments that are all own (nothing queued), more to come.
    s.graph.listComments.mockResolvedValue(ok({ items: [comment({ fromId: IG_USER, timestamp: at(-MINUTE) })], after: 'MORE' }));
    await s.poll.execute();
    expect(s.cursors.state.get(MEDIA)).toMatchObject({ resumeAfter: 'MORE', nextPollAt: null });
  });

  it('reads a quiet post every 5 minutes after 3 empty polls, and every tick again once a comment arrives', async () => {
    const s = setup();
    for (let i = 0; i < 3; i += 1) {
      await s.poll.execute();
      s.advance(MINUTE);
    }
    expect(s.cursors.state.get(MEDIA)).toMatchObject({ emptyPolls: 3, nextPollAt: at(2 * MINUTE + 5 * MINUTE) });
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenCalledTimes(3); // not due
    s.advance(5 * MINUTE);
    s.graph.listComments.mockResolvedValueOnce(ok({ items: [comment({ id: 'new', timestamp: at(7 * MINUTE) })], after: null }));
    await s.poll.execute();
    expect(s.cursors.state.get(MEDIA)).toMatchObject({ emptyPolls: 0, nextPollAt: null });
  });

  it(`caps Graph calls at ${POLL_CALLS_PER_ACCOUNT_HOUR} per account per hour, and counts again after the hour`, async () => {
    const s = setup();
    s.cursors.targets = Array.from({ length: POLL_CALLS_PER_ACCOUNT_HOUR + 5 }, (_, i) => ({ userId: USER, mediaId: `m${i}`, since: NOW }));
    for (let i = 0; i < 4; i += 1) {
      await s.poll.execute();
      s.advance(MINUTE);
    }
    expect(s.graph.listComments).toHaveBeenCalledTimes(POLL_CALLS_PER_ACCOUNT_HOUR);
    s.advance(60 * MINUTE);
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenCalledTimes(POLL_CALLS_PER_ACCOUNT_HOUR + POLL_MEDIA_PER_TICK);
  });

  // The limit hit on a LATER post used to reset the backoff in the same tick.
  it('doubles an account\'s rest while its reads keep hitting the rate limit, even after other posts were read first', async () => {
    const s = setup();
    s.cursors.targets = [{ userId: USER, mediaId: 'ok-1', since: NOW }, { userId: USER, mediaId: 'limited', since: NOW }];
    s.graph.listComments.mockImplementation(async (_t: string, mediaId: string) =>
      mediaId === 'limited' ? fail(new TooManyRequestsFailure('errors.instagram.rate_limited')) : ok({ items: [], after: null }),
    );
    const rests: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      s.cursors.state.clear(); // keep 'ok-1' first in line each time
      await s.poll.execute();
      const last = s.logger.warn.mock.calls.filter((c) => c[1] === 'instagram_comment_poll_rate_limited').at(-1);
      rests.push((last?.[0] as { minutes: number }).minutes);
      s.advance(rests[i]! * MINUTE);
    }
    expect(rests).toEqual([1, 2, 4]);
  });

  it('resets an account\'s rest after a read that does not hit the limit', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValueOnce(fail(new TooManyRequestsFailure('errors.instagram.rate_limited')));
    await s.poll.execute();
    s.advance(MINUTE);
    await s.poll.execute(); // fine
    s.graph.listComments.mockResolvedValueOnce(fail(new TooManyRequestsFailure('errors.instagram.rate_limited')));
    s.advance(MINUTE);
    await s.poll.execute();
    expect(s.logger.warn).toHaveBeenLastCalledWith({ account: IG_USER, minutes: 1 }, 'instagram_comment_poll_rate_limited');
  });

  // Instagram limits per account: one throttled creator used to stop polling for everyone.
  it('rests only the throttled account, touches its post, and keeps polling the others', async () => {
    const s = setup();
    const OTHER = '00000000-0000-4000-8000-000000000003';
    s.connections.seed(connection({ id: 'conn-3', userId: OTHER, igUserId: 'IG-OTHER', username: 'other', accessToken: 'token-other' }));
    s.cursors.targets = [{ userId: USER, mediaId: 'throttled', since: NOW }, { userId: OTHER, mediaId: 'fine', since: NOW }];
    s.graph.listComments.mockImplementation(async (token: string) =>
      token === 'token-1' ? fail(new TooManyRequestsFailure('errors.instagram.rate_limited')) : ok({ items: [], after: null }),
    );
    await s.poll.execute();
    expect(s.cursors.touches.map((t) => t[0])).toEqual(['throttled']);
    expect(s.cursors.saves.map((t) => t[0])).toEqual(['fine']);

    s.advance(30 * 1000);
    s.graph.listComments.mockClear();
    await s.poll.execute();
    expect(s.graph.listComments.mock.calls.map((c) => c[0])).toEqual(['token-other']); // throttled account still resting
  });
});

describe('PollInstagramCommentsUseCase — failures', () => {
  // A post Instagram kept failing on stayed first in line and starved the rest.
  it('marks a failing post polled so the others get their turn', async () => {
    const s = setup();
    s.cursors.targets = Array.from({ length: POLL_MEDIA_PER_TICK + 1 }, (_, i) => ({ userId: USER, mediaId: i === 0 ? 'bad' : `m${i}`, since: NOW }));
    s.graph.listComments.mockImplementation(async (_t: string, mediaId: string) =>
      mediaId === 'bad' ? fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed')) : ok({ items: [], after: null }),
    );
    await s.poll.execute();
    expect(s.cursors.touches.map((t) => t[0])).toEqual(['bad']);
    s.advance(MINUTE);
    await s.poll.execute();
    const secondTick = s.graph.listComments.mock.calls.slice(POLL_MEDIA_PER_TICK).map((c) => c[1]);
    expect(secondTick[0]).toBe(`m${POLL_MEDIA_PER_TICK}`); // the one left out first time, not 'bad' again
  });

  // Graph's paging cursor dies when comments are deleted; a resume from it
  // used to fail and be retried from the same dead cursor forever.
  it('drops a resume cursor Instagram no longer honours, keeping last_seen_at', async () => {
    const s = setup();
    s.cursors.state.set(MEDIA, { lastSeenAt: at(-DAY), polledAt: at(-MINUTE), resumeAfter: 'DEAD', resumeNewestAt: at(-MINUTE), emptyPolls: 0, nextPollAt: null });
    s.cursors.targets = [{ userId: USER, mediaId: MEDIA, since: at(-DAY) }];
    s.graph.listComments.mockResolvedValueOnce(fail(new ServiceUnavailableFailure('errors.instagram.upstream_failed')));
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenCalledWith('token-1', MEDIA, 50, 'DEAD');
    expect(s.cursors.state.get(MEDIA)).toMatchObject({ lastSeenAt: at(-DAY), resumeAfter: null, resumeNewestAt: null });
    s.advance(MINUTE);
    await s.poll.execute();
    expect(s.graph.listComments).toHaveBeenLastCalledWith('token-1', MEDIA, 50, null); // from the top again
  });

  it('expires a connection whose token Instagram refuses', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(fail(new UnauthorizedFailure('errors.instagram.token_invalid')));
    await s.poll.execute();
    expect(s.connections.rows.get(USER)?.status).toBe('expired');
  });

  it('warns and keeps the cursor when the queue refuses', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(ok({ items: [comment()], after: null }));
    jest.spyOn(s.queue, 'enqueue').mockResolvedValue(fail(new UnknownFailure('db down')));
    await s.poll.execute();
    expect(s.logger.warn).toHaveBeenCalledWith(expect.objectContaining({ mediaId: MEDIA }), 'instagram_comment_poll_enqueue_failed');
    expect(s.cursors.saves).toHaveLength(0);
    expect(s.cursors.touches).toHaveLength(1);
  });

  it('idles without an Instagram app, and skips a connection that is not usable', async () => {
    const idle = await new PollInstagramCommentsUseCase(null, new FakeCursors(), new InMemoryInstagramConnections(), new InMemoryEventQueue(), { warn: jest.fn() }).execute();
    expect(idle).toEqual({ ok: true, value: { polled: 0, queued: 0 } });
    const s = setup(connection({ status: InstagramConnectionStatus.Expired }));
    await s.poll.execute();
    expect(s.graph.listComments).not.toHaveBeenCalled();
  });
});

describe('webhook + poller deliver the same comment', () => {
  it('queues it once and sends exactly one private reply', async () => {
    const s = setup();
    s.graph.listComments.mockResolvedValue(ok({ items: [comment({ id: 'comment-1', timestamp: NOW })], after: null }));
    const sends = new InMemoryDmSends();
    const recipes = { getById: jest.fn().mockResolvedValue(ok({})) } as unknown as RecipeRepositoryInterface;
    const worker = new ProcessInstagramEventsUseCase(s.queue, s.connections, new InMemoryDmRules().seed(rule()), sends, recipes, s.graph, { warn: jest.fn() }, 'https://recipely.net', () => NOW);
    await new ReceiveInstagramWebhookUseCase(s.queue, () => NOW).execute(commentWebhook({ commentId: 'comment-1' }));
    await s.poll.execute();
    expect(s.queue.events).toHaveLength(1);
    await worker.execute();
    expect(s.graph.sendPrivateReply).toHaveBeenCalledTimes(1);
    expect(sends.only().status).toBe('sent');
  });
});
