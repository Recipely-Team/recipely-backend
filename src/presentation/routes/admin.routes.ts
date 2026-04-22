import { Router } from 'express';
import type { AdminController } from '@presentation/controllers/admin.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function adminRoutes(controller: AdminController): Router {
  const router = Router();

  // Recipes
  router.get('/recipes', asyncHandler(controller.listRecipes));
  router.get('/recipes/:id', asyncHandler(controller.getRecipe));
  router.post('/recipes', asyncHandler(controller.createRecipe));
  router.put('/recipes/:id', asyncHandler(controller.updateRecipe));
  router.delete('/recipes/:id', asyncHandler(controller.deleteRecipe));

  // Categories
  router.get('/categories', asyncHandler(controller.listCategories));
  router.get('/categories/:id', asyncHandler(controller.getCategory));
  router.post('/categories', asyncHandler(controller.createCategory));
  router.put('/categories/:id', asyncHandler(controller.updateCategory));
  router.delete('/categories/:id', asyncHandler(controller.deleteCategory));

  // Users
  router.get('/users', asyncHandler(controller.listUsers));
  router.get('/users/:id', asyncHandler(controller.getUser));
  router.put('/users/:id', asyncHandler(controller.updateUser));
  router.delete('/users/:id', asyncHandler(controller.deleteUser));

  // Favorites
  router.get('/favorites', asyncHandler(controller.listFavorites));
  router.delete('/favorites', asyncHandler(controller.deleteFavorite));

  // Feature Flags
  router.get('/feature-flags', asyncHandler(controller.listFeatureFlagsAction));
  router.patch('/feature-flags/:key', asyncHandler(controller.updateFeatureFlagAction));

  return router;
}
