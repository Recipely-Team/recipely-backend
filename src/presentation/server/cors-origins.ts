import type { CorsOptions } from 'cors';

/**
 * The web origins allowed to call this API with credentials.
 *
 * @remarks
 * - **What was wrong.** `cors({ origin: true })` reflects whatever `Origin` the
 *   caller sends, and with `credentials: true` that told every browser on the
 *   internet its site was trusted. Verified live before the change:
 *   `Origin: https://saldirgan.example` came back as
 *   `access-control-allow-origin: https://saldirgan.example`.
 * - **A request with no `Origin` is allowed.** Native apps, curl and
 *   server-to-server calls send none, and CORS is a browser mechanism — it is
 *   not what protects those. Rejecting them would break the mobile app while
 *   protecting nothing.
 * - **Extra origins come from `CORS_EXTRA_ORIGINS`** (comma-separated) so a new
 *   preview host does not need a code change.
 */
const ALLOWED_ORIGINS: readonly string[] = [
  'https://recipely.net',
  'https://www.recipely.net',
  'https://dev.recipely.net',
  // Firebase Hosting's default domains — the same builds are reachable there.
  'https://app-recipely.web.app',
  'https://app-recipely-dev.web.app',
];

/** Expo web serves on these while developing. */
const LOCAL_ORIGINS: readonly string[] = [
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
];

function extraOrigins(): readonly string[] {
  return (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

export function allowedOrigins(): readonly string[] {
  const base = [...ALLOWED_ORIGINS, ...extraOrigins()];
  return process.env.NODE_ENV === 'production' ? base : [...base, ...LOCAL_ORIGINS];
}

export function corsOptions(): CorsOptions {
  const allowed = allowedOrigins();
  return {
    credentials: true,
    origin(origin, callback) {
      // No Origin header: not a browser cross-origin request. See remarks.
      if (origin === undefined || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  };
}
