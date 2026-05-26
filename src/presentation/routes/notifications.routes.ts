import { Router, type RequestHandler } from 'express';
import type { NotificationsController } from '@presentation/controllers/notifications.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/**
 * Mounts notification routes inside /api/v1.
 * All routes require authentication.
 *
 * POST   /me/device-token           — register a push notification token
 * GET    /me/notifications          — list notifications for the current user
 * POST   /me/notifications/read-all — mark all notifications as read
 * POST   /me/notifications/:id/read — mark a single notification as read
 */
export function notificationsRoutes(
  controller: NotificationsController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);

  router.post('/device-token', asyncHandler(controller.registerDeviceToken));
  router.get('/notifications', asyncHandler(controller.list));
  router.post('/notifications/read-all', asyncHandler(controller.markAllRead));
  router.post('/notifications/:id/read', asyncHandler(controller.markOneRead));

  return router;
}
