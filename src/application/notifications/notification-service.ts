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
  /**
   * When true, skip both the stored notification and the push if an identical
   * one (same recipient, type, sender, recipe) already exists. Used for
   * toggleable actions like recipe likes so repeated like/unlike cycles do not
   * generate duplicate notifications.
   */
  readonly dedupe?: boolean;
}

export class NotificationService {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly pushNotifier: IPushNotifier,
  ) {}

  // Callers must not await this — it is intentionally fire-and-forget.
  async notify(input: NotifyInput): Promise<void> {
    if (input.dedupe === true) {
      const existing = await this.notificationRepo.exists({
        recipientId: input.recipientId,
        type: input.type,
        ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
        ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
      });
      // Already notified for this exact action — do nothing (no row, no push).
      if (existing.ok && existing.value) return;
    }

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
