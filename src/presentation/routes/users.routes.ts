import { Router, type RequestHandler } from 'express';
import type { UsersController } from '@presentation/controllers/users.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function usersRoutes(
  controller: UsersController,
  authMiddleware: RequestHandler,
  optionalAuthMiddleware: RequestHandler,
): Router {
  const router = Router();

  // Auth-protected follow/unfollow must be registered before the /:id wildcard.
  router.post('/:id/follow', authMiddleware, asyncHandler(controller.follow));
  router.delete('/:id/follow', authMiddleware, asyncHandler(controller.unfollow));

  // Before /:id, which would otherwise take `creators` as an id.
  router.get('/creators', optionalAuthMiddleware, asyncHandler(controller.listCreators));

  // Public: a guest can open a creator's page and their recipes.
  router.get('/:id', optionalAuthMiddleware, asyncHandler(controller.getProfile));
  router.get('/:id/recipes', optionalAuthMiddleware, asyncHandler(controller.getRecipes));

  return router;
}
