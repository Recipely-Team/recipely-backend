import { Router } from 'express';
import type { UsersController } from '@presentation/controllers/users.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function usersRoutes(controller: UsersController): Router {
  const router = Router();

  // Public endpoints — no auth required.
  router.get('/:id', asyncHandler(controller.getProfile));
  router.get('/:id/recipes', asyncHandler(controller.getRecipes));

  return router;
}
