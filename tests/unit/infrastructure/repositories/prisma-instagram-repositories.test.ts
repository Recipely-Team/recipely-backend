import { Prisma, type PrismaClient } from '@prisma/client';
import { InstagramTokenCipher } from '@infrastructure/instagram/instagram-token-cipher';
import { PrismaInstagramConnectionRepository } from '@infrastructure/repositories/instagram/prisma-instagram-connection-repository';
import { PrismaDmRuleRepository } from '@infrastructure/repositories/instagram/prisma-dm-rule-repository';
import { PrismaDmSendRepository } from '@infrastructure/repositories/instagram/prisma-dm-send-repository';
import { PrismaInstagramEventQueue } from '@infrastructure/repositories/instagram/prisma-instagram-event-queue';
import { PrismaCommentPollCursorRepository } from '@infrastructure/repositories/instagram/prisma-comment-poll-cursor-repository';
import { PrismaInstagramPendingLinkRepository } from '@infrastructure/repositories/instagram/prisma-instagram-pending-link-repository';
import { PrismaFollowerSnapshotRepository } from '@infrastructure/repositories/instagram/prisma-follower-snapshot-repository';
import { NOW, USER, connection, rule } from '../../fixtures/instagram-fakes';

const cipher = new InstagramTokenCipher('k'.repeat(40));
const unique = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

const connectionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'conn-1', userId: USER, igUserId: '1784', appScopedId: '2600', username: 'ada.cooks', accessTokenEnc: cipher.encrypt('token-1'),
  tokenExpiresAt: NOW, status: 'active', connectedAt: NOW, refreshedAt: NOW, updatedAt: NOW, ...overrides,
});

describe('PrismaInstagramConnectionRepository', () => {
  it('stores the token encrypted, never in the clear', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const repo = new PrismaInstagramConnectionRepository({ instagramConnection: { upsert } } as unknown as PrismaClient, cipher);
    await repo.save(connection());
    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ userId: USER });
    expect(JSON.stringify(args)).not.toContain('token-1');
    expect(cipher.decrypt(args.create.accessTokenEnc)).toBe('token-1');
  });

  it('maps the unique Instagram account to account_linked', async () => {
    const repo = new PrismaInstagramConnectionRepository({ instagramConnection: { upsert: jest.fn().mockRejectedValue(unique()) } } as unknown as PrismaClient, cipher);
    const saved = await repo.save(connection());
    expect(!saved.ok && saved.failure.messageKey).toBe('errors.conflict.instagram_account_linked');
  });

  it('reads the token back decrypted, and a token it cannot decrypt as an expired link', async () => {
    const findUnique = jest.fn().mockResolvedValueOnce(connectionRow());
    const findFirst = jest.fn().mockResolvedValueOnce(connectionRow({ accessTokenEnc: 'garbage' }));
    const repo = new PrismaInstagramConnectionRepository({ instagramConnection: { findUnique, findFirst } } as unknown as PrismaClient, cipher);
    const good = await repo.findByUserId(USER);
    expect(good.ok && [good.value?.accessToken, good.value?.status, good.value?.appScopedId]).toEqual(['token-1', 'active', '2600']);
    const bad = await repo.findByIgUserId('1784');
    expect(bad.ok && [bad.value?.accessToken, bad.value?.status]).toEqual(['', 'expired']);
  });

  // Meta's deauthorize / data-deletion callbacks may name the app-scoped id.
  it('finds a link by either Instagram id', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await new PrismaInstagramConnectionRepository({ instagramConnection: { findFirst } } as unknown as PrismaClient, cipher).findByIgUserId('2600');
    expect(findFirst.mock.calls[0][0]).toEqual({ where: { OR: [{ igUserId: '2600' }, { appScopedId: '2600' }] } });
  });

  it('purges sends, rules, pending links, the account\'s queued events, follower snapshots and the link in one transaction', async () => {
    const ops = {
      dmSend: jest.fn().mockReturnValue('s'), dmRule: jest.fn().mockReturnValue('r'), pending: jest.fn().mockReturnValue('p'),
      events: jest.fn().mockReturnValue('e'), cursors: jest.fn().mockReturnValue('k'), conn: jest.fn().mockReturnValue('c'),
      snapshots: jest.fn().mockReturnValue('f'),
    };
    const transaction = jest.fn().mockResolvedValue([]);
    const prisma = {
      dmSend: { deleteMany: ops.dmSend }, dmRule: { deleteMany: ops.dmRule }, instagramPendingLink: { deleteMany: ops.pending },
      instagramEvent: { deleteMany: ops.events }, instagramCommentCursor: { deleteMany: ops.cursors },
      instagramFollowerSnapshot: { deleteMany: ops.snapshots },
      instagramConnection: { deleteMany: ops.conn, findUnique: jest.fn().mockResolvedValue({ igUserId: '1784', appScopedId: '2600' }) },
      $transaction: transaction,
    } as unknown as PrismaClient;
    await new PrismaInstagramConnectionRepository(prisma, cipher).purgeUser(USER);
    expect(transaction).toHaveBeenCalledWith(['s', 'r', 'p', 'e', 'k', 'f', 'c']);
    expect(ops.cursors).toHaveBeenCalledWith({ where: { igUserId: { in: ['1784', '2600'] } } });
    for (const op of [ops.dmSend, ops.dmRule, ops.pending, ops.snapshots, ops.conn]) expect(op).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(ops.events).toHaveBeenCalledWith({ where: { igUserId: { in: ['1784', '2600'] } } });
  });

  it('expires active tokens that have ended, and lists ones ending soon, soonest first', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const findMany = jest.fn().mockResolvedValue([connectionRow()]);
    const repo = new PrismaInstagramConnectionRepository({ instagramConnection: { updateMany, findMany } } as unknown as PrismaClient, cipher);
    expect(await repo.expireLapsed(NOW)).toEqual({ ok: true, value: 2 });
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { status: 'active', tokenExpiresAt: { lte: NOW } }, data: { status: 'expired' } });
    await repo.listExpiringBefore(NOW, 50);
    expect(findMany.mock.calls[0][0]).toEqual({ where: { status: 'active', tokenExpiresAt: { lt: NOW } }, orderBy: { tokenExpiresAt: 'asc' }, take: 50 });
  });
});

describe('PrismaDmRuleRepository', () => {
  it('scopes every write and read by owner, answering not_found.dm_rule', async () => {
    const dmRule = { updateMany: jest.fn().mockResolvedValue({ count: 0 }), deleteMany: jest.fn().mockResolvedValue({ count: 0 }), findFirst: jest.fn().mockResolvedValue(null) };
    const repo = new PrismaDmRuleRepository({ dmRule } as unknown as PrismaClient);
    for (const result of [await repo.update(rule()), await repo.delete('rule-1', USER), await repo.findById('rule-1', USER)]) {
      expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.dm_rule');
    }
    expect(dmRule.updateMany.mock.calls[0][0].where).toEqual({ id: 'rule-1', userId: USER });
    expect(dmRule.deleteMany.mock.calls[0][0].where).toEqual({ id: 'rule-1', userId: USER });
  });

  it('lists newest first with the sent count and the recipe, paged with its count in one transaction', async () => {
    const row = {
      id: 'rule-1', userId: USER, mediaId: 'm', mediaPermalink: null, mediaThumbnail: null, mediaCaption: null, keywords: ['tarif'],
      recipeId: 'r1', dmText: 'Hi {link}', publicReplyText: null, enabled: true, enabledAt: NOW, createdAt: NOW, updatedAt: NOW,
      _count: { sends: 3 }, recipe: { id: 'r1', name: { en: 'Pasta' }, image: 'i.jpg', deletedAt: null },
    };
    const findMany = jest.fn().mockResolvedValue([row]);
    const prisma = { dmRule: { findMany, count: jest.fn().mockResolvedValue(9) }, $transaction: (ops: unknown[]) => Promise.all(ops) } as unknown as PrismaClient;
    const result = await new PrismaDmRuleRepository(prisma).listByUser(USER, 2, 5);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { userId: USER }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 5, take: 5 });
    expect(findMany.mock.calls[0][0].include._count).toEqual({ select: { sends: { where: { status: 'sent' } } } });
    expect(result.ok && [result.value.total, result.value.items[0]?.sentCount, result.value.items[0]?.recipe]).toEqual([9, 3, { id: 'r1', names: { en: 'Pasta' }, image: 'i.jpg' }]);
  });

  it('finds the enabled rules of one post, oldest first', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await new PrismaDmRuleRepository({ dmRule: { findMany } } as unknown as PrismaClient).findEnabledForMedia(USER, 'm');
    expect(findMany.mock.calls[0][0].where).toMatchObject({ userId: USER, mediaId: 'm', enabled: true });
    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('loads a stored rule from before the link rule instead of failing as corrupt', async () => {
    const row = {
      id: 'rule-1', userId: USER, mediaId: 'm', mediaPermalink: null, mediaThumbnail: null, mediaCaption: null, keywords: ['tarif'],
      recipeId: 'r', dmText: 'Tarif: https://old.example', publicReplyText: null, enabled: true,
      enabledAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    };
    const findMany = jest.fn().mockResolvedValue([row]);
    const result = await new PrismaDmRuleRepository({ dmRule: { findMany } } as unknown as PrismaClient).findEnabledForMedia(USER, 'm');
    expect(result.ok && result.value.map((r) => [r.id, r.isSendable])).toEqual([['rule-1', false]]);
  });

  // A suspended creator's automation kept DMing their followers in Recipely's
  // name: delivery found the rule and never asked about its owner.
  it('a suspended or deleted creator\'s rules send nothing', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await new PrismaDmRuleRepository({ dmRule: { findMany } } as unknown as PrismaClient).findEnabledForMedia(USER, 'm');
    expect(findMany.mock.calls[0][0].where.user).toEqual({ suspendedAt: null, deletedAt: null });
  });
});

describe('PrismaDmSendRepository', () => {
  const sendRow = { id: 's1', ruleId: 'rule-1', userId: USER, commentId: 'c1', commenterId: '9', commenterUsername: 'x', commentText: 't', status: 'sent', reason: null, publicReplied: false, createdAt: NOW, sentAt: NOW };

  it('answers the existing attempt when the comment was already claimed', async () => {
    const prisma = { dmSend: { create: jest.fn().mockRejectedValue(unique()), findUnique: jest.fn().mockResolvedValue(sendRow) } } as unknown as PrismaClient;
    const claimed = await new PrismaDmSendRepository(prisma).claim({ ruleId: 'rule-1', userId: USER, commentId: 'c1', commenterId: '9', commenterUsername: 'x', commentText: 't' });
    expect(claimed.ok && [claimed.value.id, claimed.value.status]).toEqual(['s1', 'sent']);
  });

  it('records a new attempt as pending, trimming a long comment', async () => {
    const create = jest.fn().mockResolvedValue({ ...sendRow, status: 'pending', sentAt: null });
    await new PrismaDmSendRepository({ dmSend: { create } } as unknown as PrismaClient).claim({
      ruleId: 'rule-1', userId: USER, commentId: 'c1', commenterId: null, commenterUsername: null, commentText: 'x'.repeat(900),
    });
    expect(create.mock.calls[0][0].data).toMatchObject({ status: 'pending', commentId: 'c1' });
    expect(create.mock.calls[0][0].data.commentText).toHaveLength(500);
  });

  it('stamps only the first open, and only of a sent DM', async () => {
    const updateMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const repo = new PrismaDmSendRepository({ dmSend: { updateMany } } as unknown as PrismaClient);
    expect(await repo.markOpened('s1', NOW)).toEqual({ ok: true, value: true });
    expect(await repo.markOpened('s1', NOW)).toEqual({ ok: true, value: false });
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: 's1', status: 'sent', openedAt: null }, data: { openedAt: NOW } });
  });

  it("stamps a save only when the recipe is the rule's, backfilling the open in the same transaction", async () => {
    const updateMany = jest.fn().mockReturnValueOnce('save').mockReturnValueOnce('open');
    const $transaction = jest.fn().mockResolvedValue([{ count: 1 }, { count: 0 }]);
    const saved = await new PrismaDmSendRepository({ dmSend: { updateMany }, $transaction } as unknown as PrismaClient).markSaved('s1', 'recipe-1', NOW);
    expect(saved).toEqual({ ok: true, value: true });
    expect($transaction).toHaveBeenCalledWith(['save', 'open']);
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: 's1', status: 'sent', rule: { recipeId: 'recipe-1' }, savedAt: null }, data: { savedAt: NOW } });
    expect(updateMany.mock.calls[1][0]).toEqual({ where: { id: 's1', status: 'sent', rule: { recipeId: 'recipe-1' }, openedAt: null }, data: { openedAt: NOW } });
  });

  it('adds up a range per UTC day, oldest first, counting opens and saves of whatever status', async () => {
    const at = (iso: string) => new Date(iso);
    const findMany = jest.fn().mockResolvedValue([
      { createdAt: at('2026-10-02T23:59:00Z'), status: 'sent', openedAt: at('2026-10-03T08:00:00Z'), savedAt: null },
      { createdAt: at('2026-10-01T10:00:00Z'), status: 'failed', openedAt: null, savedAt: null },
      { createdAt: at('2026-10-02T00:00:00Z'), status: 'sent', openedAt: NOW, savedAt: NOW },
    ]);
    const from = at('2026-10-01T00:00:00Z');
    const to = at('2026-10-03T00:00:00Z');
    const days = await new PrismaDmSendRepository({ dmSend: { findMany } } as unknown as PrismaClient).funnelByDay(USER, from, to);
    expect(days).toEqual({
      ok: true,
      value: [
        { day: '2026-10-01', matched: 1, sent: 0, opened: 0, saved: 0 },
        { day: '2026-10-02', matched: 2, sent: 2, opened: 2, saved: 1 },
      ],
    });
    expect(findMany.mock.calls[0][0].where).toEqual({ userId: USER, createdAt: { gte: from, lt: to } });
  });

  it('counts per rule, taking sends from a second, status-filtered group', async () => {
    const groupBy = jest.fn().mockReturnValueOnce('all').mockReturnValueOnce('sent');
    const $transaction = jest.fn().mockResolvedValue([
      [{ ruleId: 'rule-1', _count: { _all: 5, openedAt: 2, savedAt: 1 } }, { ruleId: 'rule-2', _count: { _all: 1, openedAt: 0, savedAt: 0 } }],
      [{ ruleId: 'rule-1', _count: { _all: 4 } }],
    ]);
    const rules = await new PrismaDmSendRepository({ dmSend: { groupBy }, $transaction } as unknown as PrismaClient).funnelByRule(USER, NOW, NOW);
    expect(rules).toEqual({
      ok: true,
      value: [
        { ruleId: 'rule-1', matched: 5, sent: 4, opened: 2, saved: 1 },
        { ruleId: 'rule-2', matched: 1, sent: 0, opened: 0, saved: 0 },
      ],
    });
    expect(groupBy.mock.calls[1][0].where).toMatchObject({ status: 'sent' });
  });
});

describe('PrismaFollowerSnapshotRepository', () => {
  it('upserts one row per creator per UTC day', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    await new PrismaFollowerSnapshotRepository({ instagramFollowerSnapshot: { upsert } } as unknown as PrismaClient).record(USER, '2026-10-02', 1200, 3);
    const day = new Date('2026-10-02T00:00:00.000Z');
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_day: { userId: USER, day } },
      create: { userId: USER, day, followers: 1200, mediaCount: 3 },
      update: { followers: 1200, mediaCount: 3 },
    });
  });

  it("lists active connections without today's row", async () => {
    const findMany = jest.fn().mockResolvedValue([{ userId: USER }]);
    const missing = await new PrismaFollowerSnapshotRepository({ instagramConnection: { findMany } } as unknown as PrismaClient).listMissing('2026-10-02', 100);
    expect(missing).toEqual({ ok: true, value: [USER] });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'active', user: { instagramFollowerSnapshots: { none: { day: new Date('2026-10-02T00:00:00.000Z') } } } },
      take: 100,
    });
  });

  it('reads the trend oldest first, and the first day ever', async () => {
    const findMany = jest.fn().mockResolvedValue([{ day: new Date('2026-10-01T00:00:00Z'), followers: 10 }]);
    const findFirst = jest.fn().mockResolvedValue({ day: new Date('2026-09-01T00:00:00Z') });
    const repo = new PrismaFollowerSnapshotRepository({ instagramFollowerSnapshot: { findMany, findFirst } } as unknown as PrismaClient);
    expect(await repo.listSince(USER, '2026-09-26')).toEqual({ ok: true, value: [{ day: '2026-10-01', followers: 10 }] });
    expect(await repo.firstDay(USER)).toEqual({ ok: true, value: '2026-09-01' });
  });
});

describe('PrismaInstagramEventQueue', () => {
  it('claims due rows atomically with SKIP LOCKED, bumping attempts and leasing them', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    await new PrismaInstagramEventQueue({ $queryRaw: queryRaw } as unknown as PrismaClient).claim(NOW, 20);
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = Prisma.sql(strings, ...values);
    const text = sql.text.replace(/\s+/g, ' ');
    expect(text).toContain('UPDATE instagram_events SET attempts = attempts + 1, available_at = $1');
    expect(text).toContain('WHERE status = $2 AND available_at <= $3 ORDER BY created_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED');
    expect(sql.values).toEqual([new Date(NOW.getTime() + 5 * 60 * 1000), 'queued', NOW, 20]);
  });

  // The claim compares available_at with the app's clock; a database default
  // of now() in another time zone left fresh events "not due" for hours.
  it('enqueues events due at once by the app clock', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const queued = await new PrismaInstagramEventQueue({ instagramEvent: { createMany } } as unknown as PrismaClient).enqueue(
      [{ igUserId: '1', field: 'comments', payload: { id: 'c1' }, eventTime: NOW, dedupeKey: 'comments:c1' }],
      NOW,
    );
    expect(queued).toEqual({ ok: true, value: 1 });
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ status: 'queued', availableAt: NOW, createdAt: NOW, eventTime: NOW, dedupeKey: 'comments:c1' });
  });

  it('prunes only finished events processed before the cut-off', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    expect(await new PrismaInstagramEventQueue({ instagramEvent: { deleteMany } } as unknown as PrismaClient).prune(NOW)).toEqual({ ok: true, value: 4 });
    expect(deleteMany.mock.calls[0][0]).toEqual({ where: { status: { in: ['done', 'failed'] }, processedAt: { lt: NOW } } });
  });
});

describe('PrismaInstagramPendingLinkRepository', () => {
  const pendingRow = {
    id: 'p1', userId: USER, codeHash: 'h', igUserId: '1784', appScopedId: null, username: 'ada.cooks',
    accessTokenEnc: cipher.encrypt('long'), tokenExpiresAt: NOW, expiresAt: NOW, createdAt: NOW,
  };

  it('parks the token encrypted, sweeping expired links', async () => {
    const create = jest.fn().mockReturnValue('create');
    const deleteMany = jest.fn().mockReturnValue('sweep');
    const transaction = jest.fn().mockResolvedValue([]);
    const repo = new PrismaInstagramPendingLinkRepository({ instagramPendingLink: { create, deleteMany }, $transaction: transaction } as unknown as PrismaClient, cipher);
    await repo.create('h', { userId: USER, igUserId: '1784', appScopedId: null, username: 'ada.cooks', accessToken: 'long', tokenExpiresAt: NOW, expiresAt: NOW });
    expect(transaction).toHaveBeenCalledWith(['sweep', 'create']);
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('"long"');
    expect(cipher.decrypt(create.mock.calls[0][0].data.accessTokenEnc)).toBe('long');
  });

  it('takes a link once: the second take, or one losing a race, finds nothing', async () => {
    const findMany = jest.fn().mockResolvedValue([pendingRow]);
    const deleteMany = jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const repo = new PrismaInstagramPendingLinkRepository({ instagramPendingLink: { findMany, deleteMany } } as unknown as PrismaClient, cipher);
    const first = await repo.take('h');
    expect(first.ok && first.value?.accessToken).toBe('long');
    expect(await repo.take('h')).toEqual({ ok: true, value: null });
  });
});

describe('PrismaCommentPollCursorRepository', () => {
  it('lists due posts with enabled rules of live connections, from the later of the cursor and the rules\' enabling', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    await new PrismaCommentPollCursorRepository({ $queryRaw: queryRaw } as unknown as PrismaClient).listDue(NOW, 20);
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = Prisma.sql(strings, ...values);
    const text = sql.text.replace(/\s+/g, ' ');
    // A stale cursor must not let a re-enabled rule answer last week's comments.
    expect(text).toContain('GREATEST(k.last_seen_at, MIN(r.enabled_at)) AS since');
    expect(text).toContain('k.resume_after AS "resumeAfter", k.resume_newest_at AS "resumeNewestAt"');
    expect(text).toContain('c.status = $1 AND c.token_expires_at > $2');
    expect(text).toContain('WHERE r.enabled AND (k.next_poll_at IS NULL OR k.next_poll_at <= $3)');
    expect(text).toContain('ORDER BY k.polled_at ASC NULLS FIRST, r.media_id ASC LIMIT $4');
    expect(sql.values).toEqual(['active', NOW, NOW, 20]);
  });

  it('saves a poll\'s state, and a touch moves only polled_at', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const repo = new PrismaCommentPollCursorRepository({ instagramCommentCursor: { upsert } } as unknown as PrismaClient);
    const state = { lastSeenAt: NOW, polledAt: NOW, resumeAfter: 'A', resumeNewestAt: NOW, emptyPolls: 0, nextPollAt: null };
    await repo.save('m1', '1784', state);
    expect(upsert.mock.calls[0][0]).toEqual({ where: { mediaId: 'm1' }, create: { mediaId: 'm1', igUserId: '1784', ...state }, update: { igUserId: '1784', ...state } });
    await repo.touch('m1', '1784', NOW, NOW);
    expect(upsert.mock.calls[1][0]).toEqual({ where: { mediaId: 'm1' }, create: { mediaId: 'm1', igUserId: '1784', lastSeenAt: NOW, polledAt: NOW }, update: { polledAt: NOW } });
  });
});
