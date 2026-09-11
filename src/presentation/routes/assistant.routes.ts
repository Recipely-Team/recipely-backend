import { Router, type RequestHandler } from 'express';
import type { AssistantController } from '@presentation/controllers/assistant.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/**
 * @remarks
 * **Route order carries a guarantee.** `/message` is declared before the blanket
 * `router.use(authMiddleware)` because it is the one route that also accepts the
 * narrow OS-assistant token; everything after that line is session-only by
 * default, including any route added later by someone who never read this
 * comment. Replacing the blanket `use` with per-route middleware would have made
 * the next endpoint's authentication a thing to remember.
 */
export function assistantRoutes(
  controller: AssistantController,
  authMiddleware: RequestHandler,
  aiRateLimit: RequestHandler,
  messageAuthMiddleware: RequestHandler,
): Router {
  const router = Router();
  // The typed turn is not charged against the voice budget — it is what the
  // app falls back to when that budget is gone — so the rate limit is what
  // bounds it instead.
  router.post('/message', messageAuthMiddleware, aiRateLimit, asyncHandler(controller.message));

  router.use(authMiddleware);
  router.post('/session', asyncHandler(controller.session));
  router.post('/heartbeat', asyncHandler(controller.heartbeat));
  // Session-only, deliberately: a token that could mint its own replacement
  // would be as long-lived as the account, whatever its scope said.
  router.post('/intent-token', asyncHandler(controller.intentToken));
  return router;
}
