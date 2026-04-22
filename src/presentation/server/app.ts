import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'path';
import type { Container } from '@presentation/server/bootstrap';
import { logger } from '@presentation/server/logger';
import { authRoutes } from '@presentation/routes/auth.routes';
import { healthRoutes } from '@presentation/routes/health.routes';
import { recipesRoutes } from '@presentation/routes/recipes.routes';
import { adminRoutes } from '@presentation/routes/admin.routes';
import { createAdminAuthMiddleware } from '@presentation/middlewares/admin-auth-middleware';
import { JwtTokenSigner } from '@infrastructure/security/jwt-token-signer';
import { errorHandler } from '@presentation/middlewares/error-handler';

export function createApp(container: Container): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // TODO: tighten CORS origin allowlist for production — permissive here for mobile dev.
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  app.use(pinoHttp({ logger }));

  // WHY: /health stays at root — Docker healthcheck + external LB probes target /health.
  app.use('/health', healthRoutes(container.controllers.health));

  // WHY: product routes live under /api/v1 so we can introduce /api/v2 without breaking clients.
  const v1 = express.Router();
  v1.use('/auth', authRoutes(container.controllers.auth));
  v1.use('/recipes', recipesRoutes(container.controllers.recipes));

  const adminAuth = createAdminAuthMiddleware(
    new (require('@infrastructure/security/jwt-token-signer').JwtTokenSigner)({
      secret: container.env.JWT_SECRET,
      expiresIn: container.env.JWT_EXPIRES_IN,
    }),
    container.prisma,
  );
  v1.use('/admin', adminAuth, adminRoutes(container.controllers.admin));
  app.use('/api/v1', v1);

  // Admin UI static files
  const adminStaticPath = path.resolve(process.cwd(), 'dist/admin');
  app.use('/admin', express.static(adminStaticPath));
  app.get('/admin/*', (_req, res) => {
    res.sendFile(path.join(adminStaticPath, 'index.html'));
  });
  app.get('/admin', (_req, res) => {
    res.redirect('/admin/');
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}
