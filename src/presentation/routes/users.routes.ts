import { Router, type RequestHandler } from 'express';
import type { UsersController } from '@presentation/controllers/users.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function usersRoutes(controller: UsersController, optionalAuthMiddleware: RequestHandler, authMiddleware: RequestHandler): Router {
  const router = Router();

  // Auth-protected follow/unfollow must be registered before the /:id wildcard.
  router.post('/:id/follow', authMiddleware, asyncHandler(controller.follow));
  router.delete('/:id/follow', authMiddleware, asyncHandler(controller.unfollow));

  // Public endpoints — pass optional auth so getProfile can compute isFollowedByMe.
  router.get('/:id', optionalAuthMiddleware, asyncHandler(controller.getProfile));
  router.get('/:id/recipes', asyncHandler(controller.getRecipes));

  return router;
}
