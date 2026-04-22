import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'path';
import session from 'express-session';
import type { Container } from '@presentation/server/bootstrap';
import { logger } from '@presentation/server/logger';
import { authRoutes } from '@presentation/routes/auth.routes';
import { healthRoutes } from '@presentation/routes/health.routes';
import { recipesRoutes } from '@presentation/routes/recipes.routes';
import { adminRoutes } from '@presentation/routes/admin.routes';
import { createAdminAuthMiddleware } from '@presentation/middlewares/admin-auth-middleware';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { errorHandler } from '@presentation/middlewares/error-handler';
import { buildAdminRouter } from '@infrastructure/admin/build-admin-router';

export async function createApp(container: Container): Promise<Express> {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(pinoHttp({ logger }));

  // Session middleware for AdminJS
  app.use(
    session({
      secret: container.env.JWT_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
    }),
  );

  // Health check
  app.use('/health', healthRoutes(container.controllers.health));

  // AdminJS at /admin
  const adminJS = container.admin;
  const adminRouter = await buildAdminRouter(adminJS, container.prisma, container.env.BCRYPT_ROUNDS, container.env.JWT_SECRET);
  app.use(adminJS.options.rootPath, adminRouter);

  // API v1 routes
  const v1 = express.Router();
  v1.use('/auth', authRoutes(container.controllers.auth));
  v1.use('/recipes', recipesRoutes(container.controllers.recipes));

  const adminAuth = createAdminAuthMiddleware(
    new JwtTokenSigner({ secret: container.env.JWT_SECRET, expiresIn: container.env.JWT_EXPIRES_IN }),
    container.prisma,
  );
  v1.use('/admin', adminAuth, adminRoutes(container.controllers.admin));
  app.use('/api/v1', v1);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}