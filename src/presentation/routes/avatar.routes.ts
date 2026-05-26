import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { MeController } from '@presentation/controllers/me.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, png, gif, webp) are allowed'));
    }
  },
});

export function avatarRoutes(controller: MeController, authMiddleware: RequestHandler): Router {
  const router = Router();
  router.post(
    '/me/avatar',
    authMiddleware,
    upload.single('avatar'),
    asyncHandler(controller.uploadAvatar),
  );
  return router;
}
