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
  readonly read: boolean;
  readonly createdAt: Date;
}

export interface INotificationRepository {
  create(input: {
    recipientId: string;
    type: string;
    senderId?: string;
    recipeId?: string;
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
  }): Promise<Result<boolean, Failure>>;
  listForUser(recipientId: string, limit: number, offset: number): Promise<Result<{ items: NotificationItem[]; total: number }, Failure>>;
  countUnread(recipientId: string): Promise<Result<number, Failure>>;
  markAllRead(recipientId: string): Promise<Result<void, Failure>>;
  markRead(id: string, recipientId: string): Promise<Result<void, Failure>>;
}
