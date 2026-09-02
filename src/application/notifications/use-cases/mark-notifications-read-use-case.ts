import { type Result } from '@core/result/result';
import { type Failure } from '@core/failure';
import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';

export interface MarkNotificationsReadInput {
  readonly userId: string;
  readonly notificationId?: string;
}

export class MarkNotificationsReadUseCase {
  constructor(private readonly notificationRepo: NotificationRepositoryInterface) {}

  async execute(input: MarkNotificationsReadInput): Promise<Result<void, Failure>> {
    if (input.notificationId !== undefined) {
      return this.notificationRepo.markRead(input.notificationId, input.userId);
    }
    return this.notificationRepo.markAllRead(input.userId);
  }
}
