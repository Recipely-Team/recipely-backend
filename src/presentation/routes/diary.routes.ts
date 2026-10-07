import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { DiaryController } from '@presentation/controllers/diary.controller';
import { UploadRules } from '@application/imports/upload-rules';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/** One meal photo, held in memory for the request only — never written to disk. */
const mealPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UploadRules.maxFileBytes, files: 1 },
});

/** The food diary, mounted at /diary. Every route needs a session. */
export function diaryRoutes(controller: DiaryController, authMiddleware: RequestHandler, aiRateLimit: RequestHandler): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/days/:date', asyncHandler(controller.getDay));
  router.put('/days/:date/water', asyncHandler(controller.setWater));
  router.get('/months/:month', asyncHandler(controller.getMonth));
  router.get('/recent', asyncHandler(controller.listRecent));
  router.get('/foods/search', asyncHandler(controller.searchFoods));
  router.get('/foods/recent', asyncHandler(controller.listRecentPage));
  router.get('/foods/categories', asyncHandler(controller.listCategories));
  router.get('/foods/products', asyncHandler(controller.listProducts));
  // Before /:id, which would otherwise take `barcode` as an id.
  router.get('/foods/products/barcode/:barcode', asyncHandler(controller.getBrandedProduct));
  router.get('/foods/products/:id', asyncHandler(controller.getProduct));
  router.post('/entries', asyncHandler(controller.addEntry));
  router.patch('/entries/:id', asyncHandler(controller.updateEntry));
  router.delete('/entries/:id', asyncHandler(controller.deleteEntry));
  router.get('/goals', asyncHandler(controller.getGoals));
  router.put('/goals', asyncHandler(controller.setGoals));
  // Text or a plate photo into candidate items; the daily quota is the use case's.
  router.post('/meal-parse', aiRateLimit, mealPhotoUpload.single('photo'), asyncHandler(controller.parseMeal));

  return router;
}
