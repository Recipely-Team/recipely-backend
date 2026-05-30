import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'path';
import type { Container } from '@presentation/server/bootstrap';
import { logger } from '@presentation/server/logger';
import { authRoutes } from '@presentation/routes/auth.routes';
import { healthRoutes } from '@presentation/routes/health.routes';
import { legalRoutes } from '@presentation/routes/legal.routes';
import { recipesRoutes } from '@presentation/routes/recipes.routes';
import { commentsRoutes } from '@presentation/routes/comments.routes';
import { meRoutes } from '@presentation/routes/me.routes';
import { notificationsRoutes } from '@presentation/routes/notifications.routes';
import { usersRoutes } from '@presentation/routes/users.routes';
import { createAuthMiddleware, createOptionalAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createDecryptBodyMiddleware } from '@presentation/middlewares/decrypt-body';
import { createEncryptResponseMiddleware } from '@presentation/middlewares/encrypt-response';
import { createLocaleMiddleware } from '@presentation/middlewares/locale-middleware';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { buildAdminRouter } from '@infrastructure/admin/build-admin-router';
import uploadRoutes from '@presentation/routes/upload.routes';
import { avatarRoutes } from '@presentation/routes/avatar.routes';

export async function createApp(container: Container): Promise<Express> {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(pinoHttp({ logger }));

  // Serve uploaded files. Override helmet's default CORP=same-origin so the
  // mobile/web client (different origin) can actually render <img> from here —
  // otherwise the browser fetches it (200) and refuses to display it.
  app.use(
    '/uploads',
    express.static(path.join(process.cwd(), 'public', 'uploads'), {
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

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

  // Locale detection — runs before every API request
  app.use(createLocaleMiddleware(container.ts));

  // Health check
  app.use('/health', healthRoutes(container.controllers.health));

  // Public legal pages (Privacy Policy, Terms of Use) — plain static HTML,
  // outside the AES envelope so Google Play and browsers can reach them.
  app.use('/', legalRoutes());

  // Unencrypted upload endpoint (outside AES envelope for simplicity)
  app.use('/', uploadRoutes);

  // API v1 routes — every request and response on this router is wrapped in
  // an AES-256-GCM envelope. Middleware order matters: encryptResponse must
  // override res.json BEFORE any handler runs so error responses are encrypted
  // too, and decryptBody must run before the auth middleware (auth header is
  // plain but the body, including credentials, is encrypted).
  const authMiddleware = createAuthMiddleware(container.tokens);
  const optionalAuthMiddleware = createOptionalAuthMiddleware(container.tokens);

  // Avatar upload — outside AES envelope, auth verified via authMiddleware
  app.use('/', avatarRoutes(container.controllers.me, authMiddleware));
  const v1 = express.Router();
  v1.use(createEncryptResponseMiddleware(container.aesKey));
  v1.use(createDecryptBodyMiddleware(container.aesKey));
  v1.use('/auth', authRoutes(container.controllers.auth));
  v1.use(
    '/recipes',
    recipesRoutes(container.controllers.recipes, container.controllers.favorites, authMiddleware, container.controllers.likes, optionalAuthMiddleware),
  );
  v1.use('/recipes', commentsRoutes(container.controllers.comments, authMiddleware));
  v1.use('/me', meRoutes(container.controllers.me, authMiddleware));
  v1.use('/me', notificationsRoutes(container.controllers.notifications, authMiddleware));
  v1.use('/users', usersRoutes(container.controllers.users, optionalAuthMiddleware, authMiddleware));
  // Encrypted 404 for /api/v1/* unmatched paths (consistent envelope on the
  // wire). The app-level fallback below stays plain for /admin, /health, etc.
  v1.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  app.use('/api/v1', v1);

  // 404 handler (plain) — only reached for paths outside /api/v1, /admin, /health
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  // i18n error handler — must be last; uses req.locale set by locale middleware
  app.use(createErrorHandler(container.ts));

  return app;
}