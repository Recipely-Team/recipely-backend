import type { DmSendStatusType } from '@domain/instagram/dm-send-status';
import type { DmSendReasonType } from '@domain/instagram/dm-send-reason';

/** One private reply attempt (`GET /me/instagram/rules/:id/sends`). */
export interface DmSendDto {
  readonly id: string;
  readonly commentId: string;
  readonly commenterUsername: string | null;
  readonly commentText: string | null;
  /** `pending` only while the worker is sending it. */
  readonly status: DmSendStatusType;
  /** Why it was not sent; `null` when it was. */
  readonly reason: DmSendReasonType | null;
  readonly publicReplied: boolean;
  readonly createdAt: string;
  readonly sentAt: string | null;
}
