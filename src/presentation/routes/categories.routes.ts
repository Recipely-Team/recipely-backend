import { Router } from 'express';
import type { CategoriesController } from '@presentation/controllers/categories.controller';

export function createCategoriesRoutes(categories: CategoriesController): Router {
  const router = Router();
  router.get('/', categories.list);
  return router;
}