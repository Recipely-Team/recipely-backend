import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface NotificationItem {
  readonly id: string;
  readonly type: string;
  readonly senderId: string | null;
  readonly senderDisplayName: string | null;
  readonly senderPhotoUrl: string | null;
  readonly recipeId: string | null;
  readonly recipeTitle: string | null;
  /** The comment to deep-link to. Only ever set for "comment" notifications. */
  readonly commentId: string | null;
  /** The draft to open. Only ever set for "import_done" notifications. */
  readonly draftId: string | null;
  readonly message: string | null;
  /** Where an "import_done" row's recipe came from; null for other types and for older rows. */
  readonly sourcePlatform: string | null;
  /** The account (or, for a web page, the site) the import came from, when known. */
  readonly sourceHandle: string | null;
  readonly read: boolean;
  readonly createdAt: Date;
}

export interface NotificationRepositoryInterface {
  create(input: {
    recipientId: string;
    type: string;
    senderId?: string;
    recipeId?: string;
    commentId?: string;
    draftId?: string;
    message?: string;
    sourcePlatform?: string;
    sourceHandle?: string;
  }): Promise<Result<void, Failure>>;
  /**
   * Reports whether a notification with the same identity already exists. Used
   * to deduplicate repeatable actions (e.g. like → unlike → like) so the
   * recipient is never spammed with an identical notification more than once.
   */
  exists(input: {
    recipientId: string;
    type: string;
    senderId?: string;
    recipeId?: string;
    commentId?: string;
  }): Promise<Result<boolean, Failure>>;
  listForUser(recipientId: string, limit: number, offset: number): Promise<Result<{ items: NotificationItem[]; total: number }, Failure>>;
  countUnread(recipientId: string): Promise<Result<number, Failure>>;
  markAllRead(recipientId: string): Promise<Result<void, Failure>>;
  markRead(id: string, recipientId: string): Promise<Result<void, Failure>>;
  /** Soft-deletes every notification pointing at a comment when that comment is deleted. */
  softDeleteByCommentId(commentId: string): Promise<Result<void, Failure>>;
  /**
   * Repoints every notification that opens `draftId` at the recipe the draft
   * became, and clears the draft pointer.
   *
   * An import notification stores the draft it produced, but publishing that
   * draft deletes it — so the pointer outlives its target and the tap lands on
   * a 404. The draft is not "gone", it turned into something; the notification
   * should follow it there.
   *
   * `draftId` is cleared rather than kept alongside the new `recipeId` so that
   * clients already in the field, which read the draft pointer first, also land
   * on the recipe. Which draft an import produced is still recorded on the
   * import job.
   */
  repointDraftToRecipe(draftId: string, recipeId: string): Promise<Result<void, Failure>>;
}
