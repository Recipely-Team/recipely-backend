import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { DmSendStatus, DmSendStatusType } from '@domain/instagram/dm-send-status';
import type { DmSendReasonType } from '@domain/instagram/dm-send-reason';

export interface DmSendClaim {
  readonly ruleId: string;
  readonly userId: string;
  readonly commentId: string;
  readonly commenterId: string | null;
  readonly commenterUsername: string | null;
  readonly commentText: string | null;
}

/** One private reply attempt, as the activity list shows it. */
export interface DmSendRecord {
  readonly id: string;
  readonly ruleId: string;
  readonly commentId: string;
  readonly commenterUsername: string | null;
  readonly commentText: string | null;
  readonly status: DmSendStatusType;
  readonly reason: DmSendReasonType | null;
  readonly publicReplied: boolean;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
}

export interface DmSendOutcome {
  readonly status: typeof DmSendStatus.Sent | typeof DmSendStatus.Failed;
  readonly reason: DmSendReasonType | null;
  readonly publicReplied: boolean;
  readonly at: Date;
}

/** Private reply attempts — one per comment, ever. */
export interface DmSendRepositoryInterface {
  /**
   * Records the attempt for a comment, or answers the one already recorded:
   * Instagram allows one private reply per comment, and a redelivered webhook
   * must not send twice. A `pending` answer is a retry of the same attempt.
   */
  claim(claim: DmSendClaim): Promise<Result<DmSendRecord, Failure>>;
  complete(id: string, outcome: DmSendOutcome): Promise<Result<void, Failure>>;
  /** The rule's attempts, newest first; owner-scoped like the rule. */
  listByRule(ruleId: string, userId: string, page: number, pageSize: number): Promise<Result<PageResult<DmSendRecord>, Failure>>;
  /**
   * Forgets the commenter's words and username on attempts made before
   * `cutoff` — a follower's data, kept only as long as the activity view needs
   * it. The attempt itself (status, reason, time) stays for the counts.
   */
  scrubCommenterDetailsBefore(cutoff: Date): Promise<Result<void, Failure>>;
}
