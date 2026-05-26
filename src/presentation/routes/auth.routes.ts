import { Router } from 'express';
import type { AuthController } from '@presentation/controllers/auth.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

export function authRoutes(controller: AuthController): Router {
  const router = Router();
  router.post('/register', asyncHandler(controller.handleRegister));
  router.post('/login', asyncHandler(controller.handleLogin));
  router.post('/social', asyncHandler(controller.handleSocialAuth));
  router.post('/forgot-password', asyncHandler(controller.handleForgotPassword));
  router.post('/reset-password', asyncHandler(controller.handleResetPassword));
  return router;
}
