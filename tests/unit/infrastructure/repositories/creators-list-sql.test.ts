import type { PrismaClient } from '@prisma/client';
import { CreatorStatus } from '@domain/users/creator-status';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { creatorsListSql } from '@infrastructure/repositories/users/creators-list-sql';
import { PrismaUserProfileRepository } from '@infrastructure/repositories/users/prisma-user-profile-repository';

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

  it('reports a database error as a failure, not a throw', async () => {
    const prisma = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as PrismaClient;
    const result = await new PrismaUserProfileRepository(prisma).listCreators(1, 20);
    expect(result.ok).toBe(false);
  });
});
