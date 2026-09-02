import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';
import type { PushNotifierInterface } from '@application/notifications/ports/push-notifier-interface';

export type NotificationType =
  | 'comment'
  | 'like'
  | 'follow'
  | 'ai_completed'
  | 'moderation'
  /** A background Instagram import finished; `draftId` says what to open. */
  | 'import_done';

export interface NotifyInput {
  readonly recipientId: string;
  readonly type: NotificationType;
  readonly senderId?: string;
  readonly recipeId?: string;
  /**
   * The comment that triggered this notification, so the app can deep-link
   * straight to it. Only meaningful for `type: 'comment'`.
   */
  readonly commentId?: string;
  /**
   * The draft this notification opens when tapped. Only meaningful for
   * `type: 'import_done'`.
   *
   * Carried on the notification rather than looked up later because the whole
   * point of the notification is to be one tap from the result — a client that
   * had to search the drafts list for "the newest one" would open the wrong
   * draft the moment a user runs two imports.
   */
  readonly draftId?: string;
  readonly title: string;
  readonly body: string;
  /**
   * Free-text content stored on the notification and shown in the in-app feed
   * (e.g. the comment text). Distinct from `body`, which is the push copy.
   * Omit for types that have no textual payload, like likes and follows.
   */
  readonly message?: string;
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
    private readonly notificationRepo: NotificationRepositoryInterface,
    private readonly pushNotifier: PushNotifierInterface,
  ) {}

  // Callers must not await this — it is intentionally fire-and-forget.
  async notify(input: NotifyInput): Promise<void> {
    if (input.dedupe === true) {
      const existing = await this.notificationRepo.exists({
        recipientId: input.recipientId,
        type: input.type,
        ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
        ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
        ...(input.commentId !== undefined ? { commentId: input.commentId } : {}),
      });
      // Already notified for this exact action — do nothing (no row, no push).
      if (existing.ok && existing.value) return;
    }

    await this.notificationRepo.create({
      recipientId: input.recipientId,
      type: input.type,
      ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
      ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
      ...(input.commentId !== undefined ? { commentId: input.commentId } : {}),
      ...(input.draftId !== undefined ? { draftId: input.draftId } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
    });

    // The push carries WHERE it points, not just what it says. Without this the
    // phone shows "Your recipe is ready", the user taps it, and the app simply
    // opens — there is nothing in the payload to navigate with, so the one
    // action the notification exists to offer is the one it cannot perform.
    //
    // FCM data values must be strings, so ids are included only when present
    // rather than sent as the literal "null".
    const data: Record<string, string> = {
      type: input.type,
      ...(input.draftId !== undefined ? { draftId: input.draftId } : {}),
      ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
      ...(input.commentId !== undefined ? { commentId: input.commentId } : {}),
    };

    // Send FCM push notification fire-and-forget — never fail the parent operation.
    this.pushNotifier
      .sendToUser(input.recipientId, { title: input.title, body: input.body, data })
      .catch(() => {});
  }
}
