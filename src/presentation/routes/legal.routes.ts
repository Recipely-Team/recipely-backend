import { Router } from 'express';
import path from 'path';

/**
 * Serves the public legal pages (Privacy Policy, Terms of Use) as static HTML.
 *
 * Mounted at the app root (outside the `/api/v1` AES envelope) so the URLs are
 * plain, publicly reachable, and crawlable — Google Play requires a public
 * Privacy Policy URL. Pages live in `public/legal/` and ship in the production
 * image via the Dockerfile COPY of that directory.
 */
export function legalRoutes(): Router {
  const router = Router();
  const dir = path.join(process.cwd(), 'public', 'legal');

  router.get('/privacy', (_req, res) => {
    res.sendFile(path.join(dir, 'privacy.html'));
  });
  router.get('/terms', (_req, res) => {
    res.sendFile(path.join(dir, 'terms.html'));
  });
  return router;
}
