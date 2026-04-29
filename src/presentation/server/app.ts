import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Container } from '@presentation/server/bootstrap';
import { logger } from '@presentation/server/logger';
import { authRoutes } from '@presentation/routes/auth.routes';
import { healthRoutes } from '@presentation/routes/health.routes';
import { recipesRoutes } from '@presentation/routes/recipes.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { errorHandler } from '@presentation/middlewares/error-handler';
import { buildAdminRouter } from '@infrastructure/admin/build-admin-router';

export async function createApp(container: Container): Promise<Express> {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(pinoHttp({ logger }));

  // AdminJS at /admin — mount BEFORE express.json() so AdminJS can parse its
  // own form bodies, and BEFORE the JSON limit applies to multipart uploads.
  // buildAuthenticatedRouter manages its own session — do not register session
  // middleware at app level (caused duplicate Set-Cookie + race conditions).
  const adminRouter = await buildAdminRouter(
    container.admin,
    container.prisma,
    container.env.BCRYPT_ROUNDS,
    container.env.JWT_SECRET,
    container.env.COOKIE_SECURE,
  );
  app.use(container.admin.options.rootPath, adminRouter);

  // JSON parser for the API only — AdminJS routes above use multipart/form-encoded.
  app.use(express.json({ limit: '256kb' }));

  // Health check
  app.use('/health', healthRoutes(container.controllers.health));

  // API v1 routes
  const authMiddleware = createAuthMiddleware(container.tokens);
  const v1 = express.Router();
  v1.use('/auth', authRoutes(container.controllers.auth));
  v1.use('/recipes', recipesRoutes(container.controllers.recipes, authMiddleware));
  app.use('/api/v1', v1);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}