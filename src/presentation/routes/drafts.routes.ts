import { Router, type RequestHandler } from 'express';
import type { DraftsController } from '@presentation/controllers/drafts.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function draftsRoutes(
  controller: DraftsController,
  authMiddleware: RequestHandler,
  aiRateLimit: RequestHandler,
): Router {
  const router = Router();

  // GET /drafts — list all drafts for the authenticated user
  router.get('/drafts', authMiddleware, asyncHandler(controller.list));

  // GET /drafts/latest — must come BEFORE /drafts/:id to avoid the UUID wildcard
  // swallowing the literal segment "latest".
  router.get('/drafts/latest', authMiddleware, asyncHandler(controller.getLatest));

  // GET /drafts/:id — fetch a single draft by id
  router.get('/drafts/:id', authMiddleware, asyncHandler(controller.getById));

  // PUT /drafts/:id — create or update a draft (upsert)
  router.put('/drafts/:id', authMiddleware, asyncHandler(controller.upsert));

  // DELETE /drafts/:id — remove a draft
  router.delete('/drafts/:id', authMiddleware, asyncHandler(controller.remove));

  // POST /refine — AI-powered recipe refinement (preview, not persisted)
  router.post('/refine', authMiddleware, aiRateLimit, asyncHandler(controller.refine));

  return router;
}
