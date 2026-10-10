import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { ValidationFailure } from '@core/failure';
import { UploadRules } from '@application/imports/upload-rules';
import { FridgeLimits } from '@application/fridge/fridge-limits';
import type { FridgeController } from '@presentation/controllers/fridge/fridge.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

const PHOTOS_FIELD = 'photos';

/** Up to three photos, held in memory for the request only — never written to disk. */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UploadRules.maxFileBytes, files: FridgeLimits.maxPhotos },
}).array(PHOTOS_FIELD, FridgeLimits.maxPhotos);

/**
 * Multer's own "too many files" refusals carry English copy; one photo too
 * many answers with the fridge's catalogue key instead.
 */
const fridgePhotos: RequestHandler = (req, res, next) => {
  photoUpload(req, res, (err: unknown) => {
    const tooMany =
      err instanceof multer.MulterError &&
      (err.code === 'LIMIT_FILE_COUNT' || (err.code === 'LIMIT_UNEXPECTED_FILE' && err.field === PHOTOS_FIELD));
    next(tooMany ? new ValidationFailure('errors.fridge.too_many_photos', PHOTOS_FIELD) : err);
  });
};

/**
 * "Cook from my fridge", mounted at /fridge. Both routes need a session and
 * pass the per-user AI rate limit; the daily allowance they share is the use
 * cases'.
 */
export function fridgeRoutes(controller: FridgeController, authMiddleware: RequestHandler, aiRateLimit: RequestHandler): Router {
  const router = Router();
  router.use(authMiddleware);
  router.post('/scan', aiRateLimit, fridgePhotos, asyncHandler(controller.scan));
  router.post('/ideas', aiRateLimit, asyncHandler(controller.ideas));
  return router;
}
