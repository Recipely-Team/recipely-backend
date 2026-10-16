import { Router, type RequestHandler } from 'express';
import type { MealPlanController } from '@presentation/controllers/meal-plan/meal-plan.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/**
 * The meal plan, mounted at /me/meal-plan. Every route needs a session; every
 * write also passes `writeRateLimit` (mounted after auth, so the budget is per
 * account).
 */
export function mealPlanRoutes(
  controller: MealPlanController,
  authMiddleware: RequestHandler,
  writeRateLimit: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', asyncHandler(controller.get));
  router.delete('/', writeRateLimit, asyncHandler(controller.clearRange));
  router.get('/ingredients', asyncHandler(controller.ingredients));
  router.get('/suggestion', asyncHandler(controller.suggest));
  router.post('/copy', writeRateLimit, asyncHandler(controller.copyWeek));
  router.post('/entries', writeRateLimit, asyncHandler(controller.add));
  router.patch('/entries/:id', writeRateLimit, asyncHandler(controller.update));
  router.delete('/entries/:id', writeRateLimit, asyncHandler(controller.remove));
  router.post('/entries/:id/eaten', writeRateLimit, asyncHandler(controller.markEaten));
  router.delete('/entries/:id/eaten', writeRateLimit, asyncHandler(controller.unmarkEaten));

  return router;
}
