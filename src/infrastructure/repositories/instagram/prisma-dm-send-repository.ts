import { Prisma, type DmSend as SendRow, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import { DmSendStatus, isDmSendStatus } from '@domain/instagram/dm-send-status';
import type { DmSendReasonType } from '@domain/instagram/dm-send-reason';
import type {
  DmSendClaim,
  DmSendOutcome,
  DmSendRecord,
  DmSendRepositoryInterface,
} from '@domain/instagram/dm-send-repository-interface';

const UNIQUE_VIOLATION = 'P2002';
const COMMENT_TEXT_MAX = 500;

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
