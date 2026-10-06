import type { DmRule as RuleRow, PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import { DmRule } from '@domain/instagram/dm-rule';
import { DmSendStatus } from '@domain/instagram/dm-send-status';
import type { DmRuleListData, DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';

/** What a list row loads beside the rule: its sent count and the recipe's name and cover. */
const LIST_INCLUDE = {
  _count: { select: { sends: { where: { status: DmSendStatus.Sent } } } },
  recipe: { select: { id: true, name: true, image: true, deletedAt: true } },
} as const;

type ListRow = RuleRow & {
  readonly _count: { readonly sends: number };
  readonly recipe: { readonly id: string; readonly name: unknown; readonly image: string; readonly deletedAt: Date | null };
};

const notFound = (): Failure => new NotFoundFailure('errors.not_found.dm_rule');

/**
 * **`dm_rules`** — every lookup by id is scoped by owner, so someone else's
 * rule answers `errors.not_found.dm_rule` like one that never existed. A list
 * page and its count run in one transaction.
 */
export class PrismaDmRuleRepository implements DmRuleRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(rule: DmRule): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      await this.prisma.dmRule.create({ data: { id: rule.id, userId: rule.userId, mediaId: rule.mediaId, createdAt: rule.createdAt, ...columns(rule) } });
      return ok(undefined);
    });
  }

  async update(rule: DmRule): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      const { count } = await this.prisma.dmRule.updateMany({ where: { id: rule.id, userId: rule.userId }, data: columns(rule) });
      return count === 0 ? fail(notFound()) : ok(undefined);
    });
  }

  async delete(id: string, userId: string): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      const { count } = await this.prisma.dmRule.deleteMany({ where: { id, userId } });
      return count === 0 ? fail(notFound()) : ok(undefined);
    });
  }

  async findById(id: string, userId: string): Promise<Result<DmRule, Failure>> {
    return this.guard(async () => {
      const row = await this.prisma.dmRule.findFirst({ where: { id, userId } });
      return row === null ? fail(notFound()) : toDomain(row);
    });
  }

  async findListData(id: string, userId: string): Promise<Result<DmRuleListData, Failure>> {
    return this.guard(async () => {
      const row = (await this.prisma.dmRule.findFirst({ where: { id, userId }, include: LIST_INCLUDE })) as ListRow | null;
      return row === null ? fail(notFound()) : listData(row);
    });
  }

  async listByUser(userId: string, page: number, pageSize: number): Promise<Result<PageResult<DmRuleListData>, Failure>> {
    return this.guard(async () => {
      const where = { userId };
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.dmRule.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: LIST_INCLUDE,
        }),
        this.prisma.dmRule.count({ where }),
      ]);
      const items: DmRuleListData[] = [];
      for (const row of rows as ListRow[]) {
        const data = listData(row);
        if (!data.ok) return data;
        items.push(data.value);
      }
      return ok({ items, total, page, pageSize });
    });
  }

  async findEnabledForMedia(userId: string, mediaId: string): Promise<Result<DmRule[], Failure>> {
    return this.guard(async () => {
      const rows = await this.prisma.dmRule.findMany({
        // Only an active owner's rules send: a suspended account's automation
        // must stop with it (and resume, untouched, when the suspension lifts).
        where: { userId, mediaId, enabled: true, user: { suspendedAt: null, deletedAt: null } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const rules: DmRule[] = [];
      for (const row of rows) {
        const rule = toDomain(row);
        if (rule.ok) rules.push(rule.value);
      }
      return ok(rules);
    });
  }

  private async guard<T>(run: () => Promise<Result<T, Failure>>): Promise<Result<T, Failure>> {
    try {
      return await run();
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
  }
}

function columns(rule: DmRule) {
  return {
    mediaPermalink: rule.media.permalink,
    mediaThumbnail: rule.media.thumbnailUrl,
    mediaCaption: rule.media.caption,
    keywords: [...rule.keywords],
    recipeId: rule.recipeId,
    dmText: rule.dmText,
    publicReplyText: rule.publicReplyText,
    enabled: rule.enabled,
    enabledAt: rule.enabledAt,
    updatedAt: rule.updatedAt,
  };
}

function toDomain(row: RuleRow): Result<DmRule, Failure> {
  const rule = DmRule.create({
    id: row.id,
    userId: row.userId,
    mediaId: row.mediaId,
    media: { permalink: row.mediaPermalink, thumbnailUrl: row.mediaThumbnail, caption: row.mediaCaption },
    keywords: row.keywords,
    recipeId: row.recipeId,
    dmText: row.dmText,
    publicReplyText: row.publicReplyText,
    enabled: row.enabled,
    enabledAt: row.enabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  return rule.ok ? rule : fail(new UnknownFailure(`Corrupt dm_rule ${row.id}`));
}

function listData(row: ListRow): Result<DmRuleListData, Failure> {
  const rule = toDomain(row);
  if (!rule.ok) return rule;
  const names = typeof row.recipe.name === 'object' && row.recipe.name !== null ? (row.recipe.name as Record<string, string>) : {};
  return ok({
    rule: rule.value,
    sentCount: row._count.sends,
    recipe: row.recipe.deletedAt === null ? { id: row.recipe.id, names, image: row.recipe.image } : null,
  });
}
