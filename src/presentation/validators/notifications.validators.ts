import { z } from 'zod';

export const RegisterDeviceTokenBodySchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
});

export const ListNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const NotificationIdParamSchema = z.object({
  id: z.string().uuid(),
});
