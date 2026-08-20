import cors from 'cors';
import { corsOptions } from '@presentation/server/cors-origins';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'path';
import type { Container } from '@presentation/server/bootstrap';
import { logger } from '@presentation/server/logger';
import { authRoutes } from '@presentation/routes/auth.routes';
import { healthRoutes } from '@presentation/routes/health.routes';
import { recipesRoutes } from '@presentation/routes/recipes.routes';
import { draftsRoutes } from '@presentation/routes/drafts.routes';
import { importJobsRoutes, workerImportRoutes } from '@presentation/routes/import-jobs.routes';
import { workerAuth } from '@presentation/middlewares/worker-auth';
import { commentsRoutes } from '@presentation/routes/comments.routes';
import { meRoutes } from '@presentation/routes/me.routes';
import { notificationsRoutes } from '@presentation/routes/notifications.routes';
import { usersRoutes } from '@presentation/routes/users.routes';
import { createAuthMiddleware } from '@presentation/middlewares/auth-middleware';
import { createOptionalAuthMiddleware } from '@presentation/middlewares/optional-auth-middleware';
import { createDecryptBodyMiddleware } from '@presentation/middlewares/decrypt-body';
import { createEncryptResponseMiddleware } from '@presentation/middlewares/encrypt-response';
import { createLocaleMiddleware } from '@presentation/middlewares/locale-middleware';
import { createRateLimitMiddleware } from '@presentation/middlewares/rate-limit-middleware';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { buildAdminRouter } from '@infrastructure/admin/build-admin-router';
import { uploadRoutes } from '@presentation/routes/upload.routes';
import { avatarRoutes } from '@presentation/routes/avatar.routes';
import { assistantRoutes } from '@presentation/routes/assistant.routes';
import { feedbackRoutes } from '@presentation/routes/feedback.routes';

export async function createApp(container: Container): Promise<Express> {
  const app = express();

  app.disable('x-powered-by');
  // Count the hops rather than trusting the whole chain: `true` would make
  // Express believe the LEFTMOST X-Forwarded-For entry, which the caller
  // writes. `PROXY_DEPTH` says how many proxies are genuinely in front (1 =
  // nginx, 2 = Cloudflare + nginx), so Express counts back to the hop one of
  // ours recorded. See `clientIp` for why the depth is a security boundary.
  app.set('trust proxy', container.env.PROXY_DEPTH);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors(corsOptions()));
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
  // Host gate for the panel. When ADMIN_HOST is set the panel is dispatched only
  // for that hostname and every other host falls through to the API — this is
  // what makes ADMIN_ROOT_PATH='/' safe on a process that also serves the API
  // from the same Express app (a bare '/' mount would otherwise swallow
  // /api/v1 on the API hostname). Unset (single-host deploys) → the panel mounts
  // on every host and the path prefix alone separates it from the API, exactly
  // as before.
  //
  // SECURITY: `req.hostname` is only trustworthy because every nginx vhost sets
  // `X-Forwarded-Host $host` (see deploy/nginx/*.conf), overwriting any client
  // value — exactly as this stack already does for X-Forwarded-For and
  // CF-Connecting-IP. Without that, `trust proxy` makes Express believe a
  // client-sent `X-Forwarded-Host: admin.recipely.net` on the DNS-only API host,
  // which would serve the whole panel there, outside Cloudflare Access + mTLS.
  // The admin gate is only as strong as that header discipline at the edge.
  const adminHost = container.env.ADMIN_HOST;
  const onAdminHost = (mw: RequestHandler): RequestHandler =>
    adminHost === undefined
      ? mw
      : (req, res, next) => (req.hostname === adminHost ? mw(req, res, next) : next());

  const rootPath = container.admin.options.rootPath;
  // Read the login path back from AdminJS rather than recomputing it: adminjs.ts
  // derives loginPath from rootPath, and the two mounts must not drift or the
  // rate limiter guards a route the real login never uses.
  const loginPath = container.admin.options.loginPath;

  // Guessing the admin password was unlimited: the API's limiter is mounted
  // under /api/v1 and AdminJS sits outside it, so nothing counted attempts on
  // the one login that grants write access to every table. Two people use this
  // panel, so a tight cap costs them nothing and ends automated guessing.
  // POST only — the GET that renders the form is harmless and rate-limiting it
  // would lock a legitimate operator out of their own login page.
  app.post(
    loginPath,
    onAdminHost(
      createRateLimitMiddleware({
        proxyDepth: container.env.PROXY_DEPTH,
        windowMs: 900_000,
        max: 10,
        messageKey: 'errors.too_many_requests.code_cooldown',
      }),
    ),
  );
  app.use(rootPath, onAdminHost(adminRouter));

  // JSON parser for the API only — AdminJS routes above use multipart/form-encoded.
  app.use(express.json({ limit: '256kb' }));

  // Locale detection — runs before every API request
  app.use(createLocaleMiddleware(container.ts));

  // Auth middleware — created here so it can be passed to routes mounted
  // outside the AES envelope (upload, avatar) as well as those inside v1.
  const authMiddleware = createAuthMiddleware(container.tokens, container.ensureAccountActive);
  // Optional auth for public read-only browse endpoints: populates req.user when
  // a valid token is present, but never rejects anonymous (guest) requests.
  const optionalAuthMiddleware = createOptionalAuthMiddleware(container.tokens, container.ensureAccountActive);

  // Shared per-user limiter for the expensive Gemini-backed AI endpoints
  // (/recipes/generate + /recipes/refine). Caps total AI calls per user per
  // minute; on exceed it returns 429 `too_many_requests` so the client shows
  // its rate-limit state. In-memory is fine on the single-instance host.
  const aiRateLimit = createRateLimitMiddleware({
    proxyDepth: container.env.PROXY_DEPTH,
    windowMs: 60_000,
    max: 15,
    messageKey: 'errors.too_many_requests.ai_cooldown',
  });

  // Credential endpoints are unauthenticated, so the limiter keys on client IP.
  // 30 per 5 minutes is far above what a person does and far below what a
  // password-guessing script needs — and wide enough that a carrier NAT shared
  // by many real users does not trip it.
  const credentialRateLimit = createRateLimitMiddleware({
    proxyDepth: container.env.PROXY_DEPTH,
    windowMs: 300_000,
    max: 30,
    messageKey: 'errors.too_many_requests.code_cooldown',
  });

  // Health check
  app.use('/health', healthRoutes(container.controllers.health));

  // Upload endpoint — outside AES envelope, auth required
  app.use('/', uploadRoutes(authMiddleware));

  // Avatar upload — outside AES envelope, auth verified via authMiddleware
  app.use('/', avatarRoutes(container.controllers.me, authMiddleware));
  const v1 = express.Router();
  v1.use(createEncryptResponseMiddleware(container.aesKey));
  v1.use(createDecryptBodyMiddleware(container.aesKey));
  v1.use('/auth', authRoutes(container.controllers.auth, credentialRateLimit));
  // Draft and refine routes mount on /recipes BEFORE the main recipesRoutes so
  // that /recipes/drafts/*, /recipes/refine, etc. are matched before the
  // generic /:id wildcard in recipesRoutes swallows them.
  v1.use('/recipes', draftsRoutes(container.controllers.drafts, authMiddleware, aiRateLimit));
  // Before recipesRoutes for the same reason drafts are: its `/:id` wildcard
  // would otherwise match the literal segment `import`.
  v1.use('/recipes', importJobsRoutes(container.controllers.importJobs, authMiddleware, aiRateLimit));
  v1.use(
    '/recipes',
    recipesRoutes(container.controllers.recipes, container.controllers.favorites, authMiddleware, container.controllers.likes, aiRateLimit, optionalAuthMiddleware),
  );
  v1.use('/recipes', commentsRoutes(container.controllers.comments, container.controllers.commentLikes, authMiddleware, optionalAuthMiddleware));
  v1.use('/me', meRoutes(container.controllers.me, authMiddleware));
  v1.use('/me', notificationsRoutes(container.controllers.notifications, authMiddleware));
  v1.use('/users', usersRoutes(container.controllers.users, authMiddleware));
  v1.use('/feedback', feedbackRoutes(container.controllers.feedback, authMiddleware));
  v1.use('/assistant', assistantRoutes(container.controllers.assistant, authMiddleware));
  // Encrypted 404 for /api/v1/* unmatched paths (consistent envelope on the
  // wire). The app-level fallback below stays plain for /admin, /health, etc.
  v1.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  app.use('/api/v1', v1);

  // Worker endpoints. Deliberately outside /api/v1: they carry no AES envelope
  // (a worker is not the mobile app) and answer to a shared secret rather than
  // a user token, so keeping them off the user router removes any chance of a
  // middleware ordering mistake exposing them to a logged-in caller.
  //
  // Not mounted at all when no secret is configured. An API with no workers
  // should have no worker endpoints, and an endpoint guarded by an empty
  // secret is worse than no endpoint.
  const workerSecret = container.env.WORKER_SHARED_SECRET;
  if (workerSecret !== undefined) {
    app.use('/internal', workerImportRoutes(container.controllers.importJobs, workerAuth(workerSecret)));
  }

  // 404 handler (plain) — only reached for paths outside /api/v1, /admin, /health
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
  });
  // i18n error handler — must be last; uses req.locale set by locale middleware
  app.use(createErrorHandler(container.ts));

  return app;
}