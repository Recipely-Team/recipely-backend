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
  listForUser(recipientId: string, limit: number, offset: number): Promise<Result<{ items: NotificationItem[]; total: number }, Failure>>;
  countUnread(recipientId: string): Promise<Result<number, Failure>>;
  markAllRead(recipientId: string): Promise<Result<void, Failure>>;
  markRead(id: string, recipientId: string): Promise<Result<void, Failure>>;
}
