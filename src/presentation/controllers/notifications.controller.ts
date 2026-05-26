import type { Request, Response } from 'express';
import type { RegisterFcmTokenUseCase } from '@application/notifications/use-cases/register-fcm-token-use-case';
import type { ListNotificationsUseCase } from '@application/notifications/use-cases/list-notifications-use-case';
import type { MarkNotificationsReadUseCase } from '@application/notifications/use-cases/mark-notifications-read-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';
import type { TranslationService } from '@application/i18n/translation-service';
import {
  ListNotificationsQuerySchema,
  NotificationIdParamSchema,
  RegisterDeviceTokenBodySchema,
} from '@presentation/validators/notifications.validators';

export class NotificationsController {
  constructor(
    private readonly registerToken: RegisterFcmTokenUseCase,
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly markRead: MarkNotificationsReadUseCase,
    private readonly ts: TranslationService,
  ) {}

  registerDeviceToken = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const parsed = RegisterDeviceTokenBodySchema.parse(req.body);
    const result = await this.registerToken.execute({
      userId: req.user!.id,
      token: parsed.token,
      platform: parsed.platform,
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const parsed = ListNotificationsQuerySchema.parse(req.query);
    const result = await this.listNotifications.execute({
      userId: req.user!.id,
      limit: parsed.limit,
      offset: parsed.offset,
    });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(200).json(result.value);
  };

  markAllRead = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const result = await this.markRead.execute({ userId: req.user!.id });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };

  markOneRead = async (req: Request, res: Response): Promise<void> => {
    const locale = req.locale ?? 'en';
    const { id } = NotificationIdParamSchema.parse(req.params);
    const result = await this.markRead.execute({ userId: req.user!.id, notificationId: id });
    if (!result.ok) {
      const { status, body } = failureToHttp(result.failure, (key) => this.ts.t(key, locale), locale);
      res.status(status).json(body);
      return;
    }
    res.status(204).send();
  };
}
