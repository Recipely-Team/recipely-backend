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

/** How far a group of attempts got: matched → sent → link opened → recipe saved. */
export interface DmFunnelCounts {
  /** Every attempt — a comment that matched a rule. */
  readonly matched: number;
  readonly sent: number;
  readonly opened: number;
  readonly saved: number;
}

/** One UTC day of a creator's attempts, by the day the comment was answered. */
export interface DmFunnelDay extends DmFunnelCounts {
  /** `YYYY-MM-DD`. */
  readonly day: string;
}

/** One rule's attempts in a range. */
export interface DmFunnelRule extends DmFunnelCounts {
  readonly ruleId: string;
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
  /**
   * Stamps the first open of a sent DM's recipe link. Answers whether a row
   * changed; an unknown id, an unsent attempt or a second open change nothing.
   */
  markOpened(id: string, at: Date): Promise<Result<boolean, Failure>>;
  /**
   * Stamps the save of the recipe a sent DM carried — only when `recipeId` is
   * that rule's recipe. Also stamps the open, should the link's own report
   * have been lost. Answers whether a row changed.
   */
  markSaved(id: string, recipeId: string, at: Date): Promise<Result<boolean, Failure>>;
  /** The creator's attempts created in `[from, to)`, per UTC day (days with none are left out). */
  funnelByDay(userId: string, from: Date, to: Date): Promise<Result<DmFunnelDay[], Failure>>;
  /** The creator's attempts created in `[from, to)`, per rule (rules with none are left out). */
  funnelByRule(userId: string, from: Date, to: Date): Promise<Result<DmFunnelRule[], Failure>>;
}
