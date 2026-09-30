import type { PrismaClient } from '@prisma/client';
import { CreatorStatus } from '@domain/users/creator-status';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { creatorsListSql } from '@infrastructure/repositories/users/creators-list-sql';
import { PrismaUserProfileRepository } from '@infrastructure/repositories/users/prisma-user-profile-repository';
import { pinoInstance } from '@infrastructure/logger/pino-logger';

/** The Postgres statement text (`$n` placeholders) with whitespace collapsed, so assertions read as SQL. */
const text = (sql: { text: string }): string => sql.text.replace(/\s+/g, ' ').trim();

describe('creatorsListSql — who qualifies', () => {
  const { page, total } = creatorsListSql(1, 20);

  it.each([
    ['an approved claim', 'u.creator_status = $'],
    ['a live account', 'u.deleted_at IS NULL'],
    ['an unsuspended account', 'u.suspended_at IS NULL'],
    ['a published recipe', 'is_published = true'],
    ['an approved recipe', 'moderation_status = $'],
    ['an undeleted recipe', 'deleted_at IS NULL GROUP BY owner_id'],
    ['at least one such recipe (inner join)', ') rc ON rc.owner_id = u.id'],
  ])('both statements require %s', (_label, fragment) => {
    expect(text(page)).toContain(fragment);
    expect(text(total)).toContain(fragment);
  });

  it('does not LEFT JOIN the recipe counts — a creator with none is out', () => {
    expect(text(page)).not.toMatch(/LEFT JOIN \( SELECT owner_id/);
  });

  it('binds the vocabularies as parameters, not spelled-out literals', () => {
    expect(page.values).toEqual(expect.arrayContaining([CreatorStatus.Approved, ModerationStatus.Approved]));
    expect(total.values).toEqual(expect.arrayContaining([CreatorStatus.Approved, ModerationStatus.Approved]));
  });
});

describe('creatorsListSql — order and paging', () => {
  it('orders by follower count, then recipe count, then id', () => {
    expect(text(creatorsListSql(1, 20).page)).toContain(
      'ORDER BY COALESCE(fc.follower_count, 0) DESC, rc.recipe_count DESC, u.id ASC',
    );
  });

  it('counts followers with a left join, so a creator with none still lists', () => {
    expect(text(creatorsListSql(1, 20).page)).toContain('LEFT JOIN ( SELECT following_id, COUNT(*)::int AS follower_count');
  });

  it('turns page and pageSize into LIMIT and OFFSET', () => {
    const { page } = creatorsListSql(3, 20);
    expect(text(page)).toMatch(/LIMIT \$\d+ OFFSET \$\d+$/);
    expect(page.values.slice(-2)).toEqual([20, 40]);
  });

  it('aliases columns to the item shape', () => {
    for (const alias of ['"displayName"', '"photoUrl"', '"platform"', '"handle"', '"recipeCount"', '"followerCount"']) {
      expect(text(creatorsListSql(1, 20).page)).toContain(alias);
    }
  });
});

describe('PrismaUserProfileRepository.listCreators', () => {
  it('runs page and total in one transaction and wraps them in the page envelope', async () => {
    const item = {
      id: 'u1',
      displayName: 'Ada',
      photoUrl: null,
      platform: 'instagram',
      handle: 'ada',
      recipeCount: 2,
      followerCount: 5,
    };
    const queryRaw = jest.fn((sql: unknown) => sql);
    const transaction = jest.fn().mockResolvedValue([[item], [{ total: 7 }]]);
    const prisma = { $queryRaw: queryRaw, $transaction: transaction } as unknown as PrismaClient;

    const result = await new PrismaUserProfileRepository(prisma).listCreators(2, 5);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, value: { items: [item], total: 7, page: 2, pageSize: 5 } });
  });

  it('skips a row whose platform this build does not know', async () => {
    const known = { id: 'u1', displayName: 'A', photoUrl: null, platform: 'tiktok', handle: 'a1', recipeCount: 1, followerCount: 0 };
    const unknown = { ...known, id: 'u2', platform: 'myspace' };
    const prisma = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn().mockResolvedValue([[known, unknown], [{ total: 2 }]]),
    } as unknown as PrismaClient;

    const result = await new PrismaUserProfileRepository(prisma).listCreators(1, 20);

    expect(result.ok && result.value.items.map((item) => item.id)).toEqual(['u1']);
  });

  // The strip and the profile page must agree: a claim the profile reads as
  // none must not show in the list either.
  it('drops a row whose handle fails the handle rules, logs it, and normalises the rest', async () => {
    const warn = jest.spyOn(pinoInstance, 'warn').mockImplementation(() => undefined);
    const base = { displayName: 'A', photoUrl: null, platform: 'tiktok', recipeCount: 1, followerCount: 0 };
    const prisma = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn().mockResolvedValue([
        [
          { ...base, id: 'u1', handle: 'Ada' },
          { ...base, id: 'u2', handle: 'bad..handle' },
        ],
        [{ total: 2 }],
      ]),
    } as unknown as PrismaClient;

    const result = await new PrismaUserProfileRepository(prisma).listCreators(1, 20);

    expect(result.ok && result.value.items.map((item) => [item.id, item.handle])).toEqual([['u1', 'ada']]);
    expect(result.ok && result.value.total).toBe(2); // overcounts by the dropped row — accepted
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', messageKey: 'errors.validation.creator_handle', field: 'handle' }),
      'creator_claim_unreadable',
    );
    warn.mockRestore();
  });

  it('reports a database error as a failure, not a throw', async () => {
    const prisma = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as PrismaClient;
    const result = await new PrismaUserProfileRepository(prisma).listCreators(1, 20);
    expect(result.ok).toBe(false);
  });
});
