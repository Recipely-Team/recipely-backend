import type { INotificationRepository } from '@application/notifications/ports/i-notification-repository';
import type { IPushNotifier } from '@application/notifications/ports/i-push-notifier';

export type NotificationType = 'comment' | 'like' | 'follow' | 'ai_completed' | 'moderation';

export interface NotifyInput {
  readonly recipientId: string;
  readonly type: NotificationType;
  readonly senderId?: string;
  readonly recipeId?: string;
  readonly title: string;
  readonly body: string;
}

export class NotificationService {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly pushNotifier: IPushNotifier,
  ) {}

  // Callers must not await this — it is intentionally fire-and-forget.
  async notify(input: NotifyInput): Promise<void> {
    await this.notificationRepo.create({
      recipientId: input.recipientId,
      type: input.type,
      ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
      ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
    });

    // Send FCM push notification fire-and-forget — never fail the parent operation.
    this.pushNotifier
      .sendToUser(input.recipientId, { title: input.title, body: input.body })
      .catch(() => {});
  }
}
