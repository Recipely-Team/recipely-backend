import { Prisma, type PrismaClient } from '@prisma/client';
import { InstagramTokenCipher } from '@infrastructure/instagram/instagram-token-cipher';
import { PrismaInstagramConnectionRepository } from '@infrastructure/repositories/instagram/prisma-instagram-connection-repository';
import { PrismaDmRuleRepository } from '@infrastructure/repositories/instagram/prisma-dm-rule-repository';
import { PrismaDmSendRepository } from '@infrastructure/repositories/instagram/prisma-dm-send-repository';
import { PrismaInstagramEventQueue } from '@infrastructure/repositories/instagram/prisma-instagram-event-queue';
import { NOW, USER, connection, rule } from '../../fixtures/instagram-fakes';

const cipher = new InstagramTokenCipher('k'.repeat(40));
const unique = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

const connectionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'conn-1', userId: USER, igUserId: '1784', username: 'ada.cooks', accessTokenEnc: cipher.encrypt('token-1'),
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
    const findUnique = jest.fn().mockResolvedValueOnce(connectionRow()).mockResolvedValueOnce(connectionRow({ accessTokenEnc: 'garbage' }));
    const repo = new PrismaInstagramConnectionRepository({ instagramConnection: { findUnique } } as unknown as PrismaClient, cipher);
    const good = await repo.findByUserId(USER);
    expect(good.ok && [good.value?.accessToken, good.value?.status]).toEqual(['token-1', 'active']);
    const bad = await repo.findByIgUserId('1784');
    expect(findUnique.mock.calls[1][0]).toEqual({ where: { igUserId: '1784' } });
    expect(bad.ok && [bad.value?.accessToken, bad.value?.status]).toEqual(['', 'expired']);
  });

  it('purges the user\'s sends, rules and link in one transaction', async () => {
    const ops = { dmSend: jest.fn().mockReturnValue('s'), dmRule: jest.fn().mockReturnValue('r'), conn: jest.fn().mockReturnValue('c') };
    const transaction = jest.fn().mockResolvedValue([]);
    const prisma = {
      dmSend: { deleteMany: ops.dmSend }, dmRule: { deleteMany: ops.dmRule }, instagramConnection: { deleteMany: ops.conn }, $transaction: transaction,
    } as unknown as PrismaClient;
    await new PrismaInstagramConnectionRepository(prisma, cipher).purgeUser(USER);
    expect(transaction).toHaveBeenCalledWith(['s', 'r', 'c']);
    for (const op of Object.values(ops)) expect(op).toHaveBeenCalledWith({ where: { userId: USER } });
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
      recipeId: 'r1', dmText: 'Hi {link}', publicReplyText: null, enabled: true, createdAt: NOW, updatedAt: NOW,
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
    expect(findMany.mock.calls[0][0]).toEqual({ where: { userId: USER, mediaId: 'm', enabled: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
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
    await new PrismaInstagramEventQueue({ instagramEvent: { createMany } } as unknown as PrismaClient).enqueue(
      [{ igUserId: '1', field: 'comments', payload: { id: 'c1' }, eventTime: NOW }],
      NOW,
    );
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({ status: 'queued', availableAt: NOW, createdAt: NOW, eventTime: NOW });
  });

  it('prunes only finished events processed before the cut-off', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    expect(await new PrismaInstagramEventQueue({ instagramEvent: { deleteMany } } as unknown as PrismaClient).prune(NOW)).toEqual({ ok: true, value: 4 });
    expect(deleteMany.mock.calls[0][0]).toEqual({ where: { status: { in: ['done', 'failed'] }, processedAt: { lt: NOW } } });
  });
});
