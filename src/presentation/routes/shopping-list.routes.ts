import { Router, type RequestHandler } from 'express';
import type { ShoppingListController } from '@presentation/controllers/shopping/shopping-list.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/**
 * The shopping list, mounted at /me/shopping-list. Every route needs a
 * session; every write also passes `writeRateLimit` (mounted after auth, so
 * the budget is per account).
 */
export function shoppingListRoutes(
  controller: ShoppingListController,
  authMiddleware: RequestHandler,
  writeRateLimit: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/', asyncHandler(controller.list));
  router.delete('/', writeRateLimit, asyncHandler(controller.clearAll));
  router.post('/items', writeRateLimit, asyncHandler(controller.add));
  // Before /items/:id, which would otherwise take `checked` as an id.
  router.delete('/items/checked', writeRateLimit, asyncHandler(controller.clearChecked));
  router.patch('/items/:id', writeRateLimit, asyncHandler(controller.update));
  router.delete('/items/:id', writeRateLimit, asyncHandler(controller.remove));

  return router;
}
