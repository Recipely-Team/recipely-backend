import express, { Router } from 'express';
import type { InstagramCallbackController } from '@presentation/controllers/instagram/instagram-callback.controller';
import type { InstagramWebhookController } from '@presentation/controllers/instagram/instagram-webhook.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

const WEBHOOK_BODY_LIMIT = '1mb';

/**
 * What Instagram and Meta call directly — mounted at the root, OUTSIDE the API
 * envelope and BEFORE the app-wide JSON parser: the webhook signature is an
 * HMAC over the exact bytes Meta sent, so the body must reach the controller
 * raw. The deletion callbacks are form-encoded.
 *
 * - `GET  /auth/instagram/callback`
 * - `GET  /webhooks/instagram`, `POST /webhooks/instagram`
 * - `POST /webhooks/instagram/deauthorize`, `POST /webhooks/instagram/data-deletion`
 */
export function instagramMetaRoutes(callback: InstagramCallbackController, webhook: InstagramWebhookController): Router {
  const router = Router();
  const form = express.urlencoded({ extended: false, limit: '64kb' });
  router.get('/auth/instagram/callback', asyncHandler(callback.callback));
  router.get('/webhooks/instagram', webhook.verify);
  router.post('/webhooks/instagram', express.raw({ type: () => true, limit: WEBHOOK_BODY_LIMIT }), asyncHandler(webhook.event));
  router.post('/webhooks/instagram/deauthorize', form, asyncHandler(webhook.deauthorize));
  router.post('/webhooks/instagram/data-deletion', form, asyncHandler(webhook.dataDeletion));
  return router;
}
