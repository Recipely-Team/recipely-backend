import { Prisma, type DmSend as SendRow, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import { DmSendStatus, isDmSendStatus } from '@domain/instagram/dm-send-status';
import type { DmSendReasonType } from '@domain/instagram/dm-send-reason';
import type {
  DmFunnelDay,
  DmFunnelRule,
  DmSendClaim,
  DmSendOutcome,
  DmSendRecord,
  DmSendRepositoryInterface,
} from '@domain/instagram/dm-send-repository-interface';

const UNIQUE_VIOLATION = 'P2002';
const COMMENT_TEXT_MAX = 500;
const DAY_KEY_LENGTH = 10;

/**
 * **`dm_sends`** — one row per comment, ever: the unique `comment_id` is what
 * makes a redelivered webhook a no-op, even with two workers racing.
 */
export class PrismaDmSendRepository implements DmSendRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(claim: DmSendClaim): Promise<Result<DmSendRecord, Failure>> {
    try {
      const row = await this.prisma.dmSend.create({
        data: {
          ruleId: claim.ruleId,
          userId: claim.userId,
          commentId: claim.commentId,
          commenterId: claim.commenterId,
          commenterUsername: claim.commenterUsername,
          commentText: claim.commentText?.slice(0, COMMENT_TEXT_MAX) ?? null,
          status: DmSendStatus.Pending,
        },
      });
      return ok(toRecord(row));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return this.existing(claim.commentId);
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async scrubCommenterDetailsBefore(cutoff: Date): Promise<Result<void, Failure>> {
    try {
      await this.prisma.dmSend.updateMany({
        where: { createdAt: { lt: cutoff }, OR: [{ commentText: { not: null } }, { commenterUsername: { not: null } }] },
        data: { commentText: null, commenterUsername: null },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async complete(id: string, outcome: DmSendOutcome): Promise<Result<void, Failure>> {
    try {
      await this.prisma.dmSend.update({
        where: { id },
        data: {
          status: outcome.status,
          reason: outcome.reason,
          publicReplied: outcome.publicReplied,
          sentAt: outcome.status === DmSendStatus.Sent ? outcome.at : null,
        },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listByRule(ruleId: string, userId: string, page: number, pageSize: number): Promise<Result<PageResult<DmSendRecord>, Failure>> {
    try {
      const where = { ruleId, userId };
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.dmSend.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
        this.prisma.dmSend.count({ where }),
      ]);
      return ok({ items: rows.map(toRecord), total, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async markOpened(id: string, at: Date): Promise<Result<boolean, Failure>> {
    try {
      const { count } = await this.prisma.dmSend.updateMany({ where: { id, status: DmSendStatus.Sent, openedAt: null }, data: { openedAt: at } });
      return ok(count > 0);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async markSaved(id: string, recipeId: string, at: Date): Promise<Result<boolean, Failure>> {
    try {
      const where = { id, status: DmSendStatus.Sent, rule: { recipeId } };
      const [saved] = await this.prisma.$transaction([
        this.prisma.dmSend.updateMany({ where: { ...where, savedAt: null }, data: { savedAt: at } }),
        this.prisma.dmSend.updateMany({ where: { ...where, openedAt: null }, data: { openedAt: at } }),
      ]);
      return ok(saved.count > 0);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async funnelByDay(userId: string, from: Date, to: Date): Promise<Result<DmFunnelDay[], Failure>> {
    try {
      const rows = await this.prisma.dmSend.findMany({
        where: { userId, createdAt: { gte: from, lt: to } },
        select: { createdAt: true, status: true, openedAt: true, savedAt: true },
      });
      const days = new Map<string, DmFunnelDay>();
      for (const row of rows) {
        const day = row.createdAt.toISOString().slice(0, DAY_KEY_LENGTH);
        const prev = days.get(day) ?? { day, matched: 0, sent: 0, opened: 0, saved: 0 };
        days.set(day, {
          day,
          matched: prev.matched + 1,
          sent: prev.sent + (row.status === DmSendStatus.Sent ? 1 : 0),
          opened: prev.opened + (row.openedAt !== null ? 1 : 0),
          saved: prev.saved + (row.savedAt !== null ? 1 : 0),
        });
      }
      return ok([...days.values()].sort((a, b) => a.day.localeCompare(b.day)));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async funnelByRule(userId: string, from: Date, to: Date): Promise<Result<DmFunnelRule[], Failure>> {
    try {
      const where = { userId, createdAt: { gte: from, lt: to } };
      const [all, sent] = await this.prisma.$transaction([
        this.prisma.dmSend.groupBy({ by: ['ruleId'], where, orderBy: { ruleId: 'asc' }, _count: { _all: true, openedAt: true, savedAt: true } }),
        this.prisma.dmSend.groupBy({ by: ['ruleId'], where: { ...where, status: DmSendStatus.Sent }, orderBy: { ruleId: 'asc' }, _count: { _all: true } }),
      ]);
      const sentByRule = new Map(sent.map((g) => [g.ruleId, countOf(g._count, '_all')]));
      return ok(
        all.map((g) => ({
          ruleId: g.ruleId,
          matched: countOf(g._count, '_all'),
          sent: sentByRule.get(g.ruleId) ?? 0,
          opened: countOf(g._count, 'openedAt'),
          saved: countOf(g._count, 'savedAt'),
        })),
      );
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  private async existing(commentId: string): Promise<Result<DmSendRecord, Failure>> {
    try {
      const row = await this.prisma.dmSend.findUnique({ where: { commentId } });
      return row === null ? fail(new UnknownFailure('dm_send claim lost its row')) : ok(toRecord(row));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function toRecord(row: SendRow): DmSendRecord {
  return {
    id: row.id,
    ruleId: row.ruleId,
    commentId: row.commentId,
    commenterUsername: row.commenterUsername,
    commentText: row.commentText,
    status: isDmSendStatus(row.status) ? row.status : DmSendStatus.Failed,
    reason: row.reason as DmSendReasonType | null,
    publicReplied: row.publicReplied,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}

/** Prisma types a groupBy's `_count` loosely when `orderBy` is present. */
function countOf(count: unknown, key: string): number {
  if (typeof count !== 'object' || count === null) return 0;
  const value = (count as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
