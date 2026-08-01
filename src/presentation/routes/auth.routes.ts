import { Router, type RequestHandler } from 'express';
import type { AuthController } from '@presentation/controllers/auth.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';

/**
 * Credential endpoints.
 *
 * @remarks
 * Every route here is unauthenticated by definition, which is what made them
 * the one part of the API with no rate limit at all: an attacker could try
 * passwords, enumerate emails or burn the verification-code mailer as fast as
 * the network allowed. `credentialLimit` is keyed by client IP (see
 * `clientIp`) and is deliberately generous — mobile carriers put many real
 * users behind one address, so the limit has to stop automation without
 * catching a family on the same network.
 */
export function authRoutes(controller: AuthController, credentialLimit: RequestHandler): Router {
  const router = Router();
  router.post('/register', credentialLimit, asyncHandler(controller.handleRegister));
  router.post('/register/verify', credentialLimit, asyncHandler(controller.handleVerifyRegistration));
  router.post('/register/resend', credentialLimit, asyncHandler(controller.handleResendRegistrationCode));
  router.post('/login', credentialLimit, asyncHandler(controller.handleLogin));
  router.post('/social', credentialLimit, asyncHandler(controller.handleSocialAuth));
  router.post('/forgot-password', credentialLimit, asyncHandler(controller.handleForgotPassword));
  router.post('/reset-password', credentialLimit, asyncHandler(controller.handleResetPassword));
  return router;
}
