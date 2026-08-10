import express, { Router, type RequestHandler } from 'express';
import type { ImportJobsController } from '@presentation/controllers/import-jobs.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/**
 * Body limit for a completion.
 *
 * The global limit is 256 kb, which a base64 cover frame alone exceeds. Raised
 * here and nowhere else: a bigger limit on a public route is a cheap way to
 * make the server allocate megabytes per request, and only this one route has a
 * caller that must send an image.
 */
const COMPLETION_BODY_LIMIT = '4mb';

/**
 * The client-facing half of the queue.
 *
 * Mounted under `/recipes`, alongside the synchronous `/recipes/import` that it
 * does NOT replace. Shipped apps call the old endpoint and expect a recipe
 * back; changing what it returns would break every install that has not
 * updated. The new path is additive, and the old one can be retired once the
 * old versions are gone.
 */
export function importJobsRoutes(
  controller: ImportJobsController,
  authMiddleware: RequestHandler,
  importRateLimit: RequestHandler,
): Router {
  const router = Router();

  // POST /recipes/import/jobs — accept an import, return a job id (202).
  router.post('/import/jobs', authMiddleware, importRateLimit, asyncHandler(controller.enqueue));

  // GET /recipes/import/jobs/:id — poll a job the caller owns.
  router.get('/import/jobs/:id', authMiddleware, asyncHandler(controller.get));

  return router;
}

/**
 * The worker-facing half.
 *
 * @remarks
 * - **Separate router, separate mount, separate auth.** These endpoints answer
 *   to a shared secret rather than a user, so keeping them off `/api/v1`
 *   removes any chance of a user-authenticated request reaching them because a
 *   middleware was ordered wrong.
 * - **No user rate limit.** The limiter keys on the client address, and every
 *   worker is one address polling continuously; applying it here would throttle
 *   the fleet to a standstill. The shared secret is what bounds who may call.
 */
export function workerImportRoutes(
  controller: ImportJobsController,
  workerAuthMiddleware: RequestHandler,
): Router {
  const router = Router();

  router.use(workerAuthMiddleware);

  // POST /internal/import-jobs/claim — take the next job, or 204 if idle.
  router.post('/import-jobs/claim', asyncHandler(controller.claim));

  // POST /internal/import-jobs/:id/complete — report a recipe and a cover.
  router.post(
    '/import-jobs/:id/complete',
    express.json({ limit: COMPLETION_BODY_LIMIT }),
    asyncHandler(controller.complete),
  );

  // POST /internal/import-jobs/:id/fail — report why there is no recipe.
  router.post('/import-jobs/:id/fail', asyncHandler(controller.fail));

  return router;
}
