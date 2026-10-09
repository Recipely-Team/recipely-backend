import { ok } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import { DmSendStatus } from '@domain/instagram/dm-send-status';
import type { FollowerPoint, FollowerSnapshotRepositoryInterface } from '@domain/instagram/follower-snapshot-repository-interface';
import { GetCreatorStatsUseCase } from '@application/instagram/stats/get-creator-stats-use-case';
import { RecordDmOpenUseCase } from '@application/instagram/stats/record-dm-open-use-case';
import { RecordDmSaveUseCase } from '@application/instagram/stats/record-dm-save-use-case';
import { SnapshotInstagramFollowersUseCase } from '@application/instagram/stats/snapshot-instagram-followers-use-case';
import {
  InMemoryDmRules,
  InMemoryDmSends,
  InMemoryInstagramConnections,
  NOW,
  RECIPE,
  USER,
  connection,
  fakeGraph,
  rule,
} from '../../fixtures/instagram-fakes';

class InMemorySnapshots implements FollowerSnapshotRepositoryInterface {
  points: FollowerPoint[] = [];
  first: string | null = null;
  missing: string[] = [];
  readonly recorded: { userId: string; day: string; followers: number; mediaCount: number }[] = [];
  async record(userId: string, day: string, followers: number, mediaCount: number) {
    this.recorded.push({ userId, day, followers, mediaCount });
    return ok(undefined);
  }
  async listMissing() {
    return ok(this.missing);
  }
  async listSince(_userId: string, fromDay: string) {
    return ok(this.points.filter((p) => p.day >= fromDay));
  }
  async firstDay() {
    return ok(this.first);
  }
}

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() });

async function sentAttempt(sends: InMemoryDmSends, ruleId = 'rule-1'): Promise<string> {
  const claimed = await sends.claim({ ruleId, userId: USER, commentId: `c-${sends.rows.size}`, commenterId: null, commenterUsername: null, commentText: null });
  if (!claimed.ok) throw new Error('fixture');
  await sends.complete(claimed.value.id, { status: DmSendStatus.Sent, reason: null, publicReplied: false, at: NOW });
  return claimed.value.id;
}

describe('GetCreatorStatsUseCase', () => {
  const setup = () => {
    const connections = new InMemoryInstagramConnections();
    const rules = new InMemoryDmRules();
    const sends = new InMemoryDmSends();
    const snapshots = new InMemorySnapshots();
    const uc = new GetCreatorStatsUseCase(connections, rules, sends, snapshots, () => NOW);
    return { connections, rules, sends, snapshots, uc };
  };

  it('covers the range up to and including today, with every day present and the previous period alongside', async () => {
    const s = setup();
    s.sends.dayFunnel = [
      { day: '2026-09-20', matched: 9, sent: 9, opened: 9, saved: 9 },
      { day: '2026-09-27', matched: 4, sent: 3, opened: 1, saved: 0 },
      { day: '2026-10-02', matched: 5, sent: 4, opened: 2, saved: 1 },
    ];
    const stats = await s.uc.execute({ userId: USER, days: 7 });
    if (!stats.ok) throw new Error('expected ok');
    expect(stats.value).toMatchObject({ days: 7, from: '2026-09-26', to: '2026-10-03', connected: false });
    expect(stats.value.daily.map((d) => d.day)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(stats.value.daily[0]).toEqual({ day: '2026-09-26', matched: 0, sent: 0, opened: 0, saved: 0 });
    expect(stats.value.totals).toEqual({ matched: 9, sent: 7, opened: 3, saved: 1 });
    expect(stats.value.previous).toEqual({ matched: 9, sent: 9, opened: 9, saved: 9 });
  });

  it('lists every automated post, the quiet ones too, ordered by opens then sends', async () => {
    const s = setup();
    s.rules.seed(rule({ id: 'quiet' }), rule({ id: 'busy' }), rule({ id: 'sends-only' }));
    s.sends.ruleFunnel = [
      { ruleId: 'busy', matched: 10, sent: 9, opened: 6, saved: 2 },
      { ruleId: 'sends-only', matched: 3, sent: 3, opened: 0, saved: 0 },
    ];
    const stats = await s.uc.execute({ userId: USER, days: 30 });
    if (!stats.ok) throw new Error('expected ok');
    expect(stats.value.posts.map((p) => [p.ruleId, p.opened, p.sent])).toEqual([
      ['busy', 6, 9],
      ['sends-only', 0, 3],
      ['quiet', 0, 0],
    ]);
  });

  it('reads the follower trend from the snapshots: latest, change across the range, and when tracking began', async () => {
    const s = setup();
    await s.connections.save(connection());
    s.snapshots.first = '2026-09-30';
    s.snapshots.points = [
      { day: '2026-09-30', followers: 1000 },
      { day: '2026-10-01', followers: 1040 },
      { day: '2026-10-02', followers: 1025 },
    ];
    const stats = await s.uc.execute({ userId: USER, days: 7 });
    if (!stats.ok) throw new Error('expected ok');
    expect(stats.value.connected).toBe(true);
    expect(stats.value.followers).toMatchObject({ current: 1025, change: 25, trackingSince: '2026-09-30' });
  });

  it('has no change from a single snapshot, and nothing at all before the first one', async () => {
    const s = setup();
    s.snapshots.points = [{ day: '2026-10-02', followers: 50 }];
    s.snapshots.first = '2026-10-02';
    const one = await s.uc.execute({ userId: USER, days: 7 });
    expect(one.ok && one.value.followers).toMatchObject({ current: 50, change: null });
    s.snapshots.points = [];
    s.snapshots.first = null;
    const none = await s.uc.execute({ userId: USER, days: 7 });
    expect(none.ok && none.value.followers).toEqual({ current: null, change: null, trackingSince: null, points: [] });
  });
});

describe('RecordDmOpenUseCase / RecordDmSaveUseCase', () => {
  it('counts only the first open of a sent DM, and answers the same for anything else', async () => {
    const sends = new InMemoryDmSends();
    const id = await sentAttempt(sends);
    const uc = new RecordDmOpenUseCase(sends, () => NOW);
    expect(await uc.execute(id)).toEqual({ ok: true, value: undefined });
    expect(await uc.execute(id)).toEqual({ ok: true, value: undefined });
    expect(await uc.execute('00000000-0000-4000-8000-00000000dead')).toEqual({ ok: true, value: undefined });
    expect([...sends.opened.keys()]).toEqual([id]);
  });

  it('counts a save only for the recipe the DM carried, and backfills a lost open', async () => {
    const sends = new InMemoryDmSends();
    const id = await sentAttempt(sends);
    const uc = new RecordDmSaveUseCase(sends, () => NOW);
    await uc.execute({ sendId: id, recipeId: '00000000-0000-4000-8000-0000000000bb' });
    expect(sends.saved.size).toBe(0);
    await uc.execute({ sendId: id, recipeId: RECIPE });
    expect(sends.saved.get(id)).toEqual(NOW);
    expect(sends.opened.get(id)).toEqual(NOW);
  });
});

describe('SnapshotInstagramFollowersUseCase', () => {
  const setup = () => {
    const graph = fakeGraph();
    const connections = new InMemoryInstagramConnections();
    const snapshots = new InMemorySnapshots();
    const log = logger();
    return { graph, connections, snapshots, log, uc: new SnapshotInstagramFollowersUseCase(graph, connections, snapshots, log, () => NOW) };
  };

  it("writes today's follower count for every connected account still missing one", async () => {
    const s = setup();
    await s.connections.save(connection());
    s.snapshots.missing = [USER];
    expect(await s.uc.execute()).toEqual({ ok: true, value: { recorded: 1, failed: 0 } });
    expect(s.snapshots.recorded).toEqual([{ userId: USER, day: '2026-10-02', followers: 1200, mediaCount: 3 }]);
  });

  it('leaves a failed account for the next hour and logs it, without stopping the others', async () => {
    const s = setup();
    await s.connections.save(connection());
    s.snapshots.missing = ['gone-user', USER];
    s.graph.profile.mockResolvedValueOnce({ ok: false, failure: new UnknownFailure('boom') });
    expect(await s.uc.execute()).toEqual({ ok: true, value: { recorded: 0, failed: 2 } });
    expect(s.log.warn).toHaveBeenCalledWith(expect.objectContaining({ userId: USER }), 'instagram_follower_snapshot_failed');
  });

  it('idles when Instagram is not configured', async () => {
    const s = setup();
    s.snapshots.missing = [USER];
    const idle = new SnapshotInstagramFollowersUseCase(null, s.connections, s.snapshots, logger(), () => NOW);
    expect(await idle.execute()).toEqual({ ok: true, value: { recorded: 0, failed: 0 } });
  });
});
