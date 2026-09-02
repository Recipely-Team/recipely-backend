import { fail, ok, type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { NotificationRepositoryInterface, NotificationItem } from '@application/notifications/ports/notification-repository-interface';

export interface ListNotificationsInput {
  readonly userId: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ListNotificationsResult {
  readonly items: NotificationItem[];
  readonly total: number;
  readonly unreadCount: number;
}

export class ListNotificationsUseCase {
  constructor(private readonly notificationRepo: NotificationRepositoryInterface) {}

  async execute(input: ListNotificationsInput): Promise<Result<ListNotificationsResult, Failure>> {
    const limit = input.limit ?? 20;
    const offset = input.offset ?? 0;

    const listResult = await this.notificationRepo.listForUser(input.userId, limit, offset);
    if (!listResult.ok) return listResult;

    const unreadResult = await this.notificationRepo.countUnread(input.userId);
    if (!unreadResult.ok) return fail(unreadResult.failure);

    return ok({
      items: listResult.value.items,
      total: listResult.value.total,
      unreadCount: unreadResult.value,
    });
  }
}
