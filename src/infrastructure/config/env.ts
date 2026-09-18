import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Lifetime of the narrow token the OS assistant carries, in seconds (30 days).
  // Long on purpose: the phone may go weeks without the app being opened while
  // Siri is still asked questions, so a session-length expiry would make the
  // feature fail silently. The answer to a long life is the small scope, not a
  // shorter one. Seconds rather than a duration string because the client is told
  // an absolute expiry and the two must not be derived separately.
  ASSISTANT_INTENT_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  // AdminJS session cookie. Defaults to TRUE: nginx terminates TLS in front of
  // every deployed environment, so the cookie can and must be marked `Secure`
  // and never travel in the clear.
  //
  // The old default was `false`, justified by "the production host currently
  // serves plain HTTP". That stopped being true when nginx landed, and the
  // stale default meant the session cookie for an account with write access to
  // every table carried no Secure flag. Set it to false only for a local
  // http://localhost run.
  COOKIE_SECURE: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .default(true),
  // 32-byte (64 hex chars) AES-256-GCM key used to encrypt request/response
  // payloads under /api/v1. Generate once with `openssl rand -hex 32` and share
  // the same value with the mobile client. Mobile binary leaks compromise the
  // key — TLS is the proper transport-layer fix; this is a soft wrapper.
  API_AES_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'API_AES_KEY must be 64 hex chars (32 bytes)'),
  // How many proxies sit in front of this instance, and therefore how much of
  // the forwarded chain may be believed.
  //   1 = nginx only          — the hostname is NOT proxied by Cloudflare
  //   2 = Cloudflare + nginx  — the hostname IS proxied
  // This is a security boundary, not a tuning knob. At depth 1 anyone can send
  // `CF-Connecting-IP` or forge the left of `X-Forwarded-For`, so only the hop
  // nginx itself recorded is believed; at depth 2 Cloudflare has already
  // overwritten the header and it is the real client. Getting it too HIGH is
  // the dangerous direction: it lets a caller choose their own rate-limit key.
  PROXY_DEPTH: z.coerce.number().int().min(1).max(2).default(1),
  // Where the AdminJS panel is served. Two coupled knobs:
  //
  //   ADMIN_ROOT_PATH — AdminJS bakes this prefix into every link, redirect and
  //     asset URL it emits, so it is the real URL of the panel, not just a mount
  //     point. Default `/admin` keeps the panel under a path on a shared host
  //     (e.g. dev-api.recipely.net/admin). Set to `/` to serve it at a host root
  //     (admin.recipely.net) with no redundant path segment.
  //
  //   ADMIN_HOST — when set, the panel is dispatched ONLY for requests whose
  //     hostname matches, and passes through to the API for every other host.
  //     This is what makes `ADMIN_ROOT_PATH=/` safe on a process that also
  //     serves the API from the same Express app: without the host gate a root
  //     mount would swallow `/api/v1` on the API hostname too. Leave unset on a
  //     single-host deployment where API and panel share one name — then the
  //     path prefix alone separates them and the panel mounts on every host.
  ADMIN_ROOT_PATH: z
    .string()
    .startsWith('/', 'ADMIN_ROOT_PATH must start with /')
    .default('/admin'),
  // Preprocess is load-bearing: Compose injects `""` for an unset
  // `${ADMIN_HOST:-}`, and `""` is not `undefined`, so `.optional()` alone would
  // let an empty string through and gate the panel to a hostname no request
  // ever has — locking the panel out on every host. Map `""` → undefined.
  ADMIN_HOST: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(1).optional(),
  ),
  // Shared secret the import workers authenticate with. A worker is not a
  // person: it has no account and nothing to log in as, so it presents this
  // instead. Optional because the API runs perfectly well with no workers — the
  // internal endpoints are simply not mounted, which is the safe way to be
  // unconfigured. Length floor is the whole of the strength: this is the only
  // thing standing between the internet and "hand me the next user's job".
  // The preprocess is load-bearing, not tidiness: Compose injects `""` for an
  // unset `${WORKER_SHARED_SECRET:-}`, and an empty string is NOT `undefined`,
  // so `.optional()` would not save it — `.min(32)` would reject it and the API
  // would refuse to boot on every deployment that simply has no workers.
  WORKER_SHARED_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(32, 'WORKER_SHARED_SECRET must be at least 32 chars').optional(),
  ),
  // How long a worker's claim is honoured before the job may be taken by
  // someone else. Must comfortably exceed a real import (measured 59-128 s) or
  // two workers will run the same job; must not be so long that a dead worker
  // strands a user for an hour.
  IMPORT_LEASE_MS: z.coerce.number().int().min(60_000).default(300_000),
  // Claims after which a job is abandoned rather than handed out again. Bounds
  // a URL that kills whatever picks it up: without it the fleet is taken down
  // one box at a time, forever.
  IMPORT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  // Unfinished jobs one user may have at once. The queue is FIFO, so an
  // unbounded producer is a denial of service against everyone else.
  IMPORT_MAX_IN_FLIGHT_PER_USER: z.coerce.number().int().min(1).max(50).default(5),
  // Base URL for generating file upload URLs (e.g., http://localhost:3000 in dev)
  BASE_URL: z.string().url().optional().or(z.string().startsWith('http').optional()),
  // AI recipe generation — provider/model can be swapped without redeploying
  // the use case. Bootstrap reads these to select the adapter.
  AI_PROVIDER: z.enum(['gemini', 'anthropic', 'groq']).default('groq'),
  // Active-provider model id for the recipe generator/refiner. Optional — when
  // unset, bootstrap falls back to GROQ_MODEL_NAME (correct for the default
  // 'groq' provider). Set explicitly when AI_PROVIDER is 'gemini'/'anthropic'.
  // Empty string (Docker Compose injects `""` for an unset `${AI_MODEL:-}`) is
  // coerced to undefined so the fallback engages.
  AI_MODEL: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional()),
  // Model used for all Groq calls (recipe gen/refine, nutrition, and the
  // recipe/comment/prompt moderators). Must support JSON mode
  // (response_format: json_object). llama-4-scout was shut down by Groq on
  // 2026-07-17; gpt-oss-120b is Groq's recommended replacement, a current
  // production model with generous free-tier limits, and supports JSON mode.
  // The vision model for Instagram import is separate — see
  // groq-instagram-recipe-importer.ts.
  GROQ_MODEL_NAME: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(1).default('openai/gpt-oss-120b'),
  ),
  // Model used for Gemini recipe generation. `-latest` rather than a pinned
  // version for the same reason the import path pins nothing: a listed model is
  // not an offered one, and a pinned name is a time bomb that only goes off in
  // production (see gemini-import-model.ts, verified against the live API).
  // Measured 2026-09-18, against the deployed key: `gemini-flash-latest` answers
  // 503 "high demand" for EVERY real request, and has for days — so the Gemini
  // seat was dead and every recipe was written by the fallback without anything
  // saying so. `gemini-3.8/3.7/3.6-flash` 503 the same way under a real prompt.
  // `gemini-flash-lite-latest` answered 3 of 3 in 3-4 s with a correct recipe.
  // A listed model is not a callable one; probe before pinning.
  GEMINI_MODEL_NAME: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(1).default('gemini-flash-lite-latest'),
  ),
  // One key per provider, kept for every environment already deployed with it.
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  // ...and as MANY keys as the operator holds, comma-separated. These providers
  // rate-limit per key, so a second key is a second quota — which on the free
  // tiers is the difference between a queue that drains and one that spends the
  // afternoon retrying. Both forms are read and merged, so adding the plural
  // never breaks a box that still sets the singular.
  GEMINI_API_KEYS: z.string().optional(),
  // The assistant's key tiers. Kept apart from the generic pool above because
  // a paid key spends money on every call and must never absorb free traffic —
  // see AssistantKeyTier. The legacy singular/plural vars fold into FREE, since
  // that is what every key on every box already deployed is.
  GEMINI_API_KEYS_FREE: z.string().optional(),
  GEMINI_API_KEYS_PAID: z.string().optional(),
  // ---- Voice assistant (Gemini Live) ----
  // The model id is configuration, not a constant, and it is deliberately not
  // shipped in the app: a model that appears in ListModels is not necessarily
  // callable, and swapping one costs a deploy here rather than an App Review
  // cycle there. Measured default — the 2.5 native-audio family leaks its
  // reasoning as visible text parts and bills ~100 thoughts tokens a turn.
  ASSISTANT_LIVE_MODEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(1).default('models/gemini-3.1-flash-live-preview'),
  ),
  // Per user per day. Voice measured at roughly 950 tokens for one complete
  // "make me a recipe" exchange, so ten minutes is a generous allowance rather
  // than a tight one.
  // The typed mode's model. A separate variable from ASSISTANT_LIVE_MODEL
  // because they are different families — the Live models only speak, and a
  // typed turn wants the cheapest text model that can call a tool.
  ASSISTANT_TEXT_MODEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(1).default('gemini-flash-latest'),
  ),
  // Preprocessed like AI_MODEL above, and for the same reason: Docker Compose
  // injects "" for an unset `${VAR:-}`, and `z.coerce.number()` turns "" into
  // 0, which fails `.positive()` — so an operator who simply did not set this
  // would crashloop the API on boot rather than get the default.
  ASSISTANT_DAILY_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().positive().default(600),
  ),
  // Across every user, per day. The free tier is one API key, so one enthusiastic
  // afternoon can exhaust the quota for everybody; past this, the app falls back
  // to the text mode instead of failing.
  ASSISTANT_GLOBAL_DAILY_SECONDS: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().positive().default(36000),
  ),
  ANTHROPIC_API_KEYS: z.string().optional(),
  GROQ_API_KEYS: z.string().optional(),
  // Firebase project ID — used to verify the `iss` and `aud` claims in
  // Firebase ID tokens sent by the mobile app for social sign-in.
  // Find it in the Firebase console → Project settings → General → Project ID.
  FIREBASE_PROJECT_ID: z.string().min(1),
  // Base64-encoded Firebase Admin SDK service account JSON. Required for push notifications.
  // Generate from Firebase console → Project settings → Service accounts → Generate new private key.
  // Encode with: base64 -i serviceAccount.json
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  // SMTP config for transactional emails (password reset). All optional — if absent,
  // a no-op sender is used so the server starts without email configured.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Universal-link base used to build password-reset deep links
  // (`<APP_BASE_URL>/reset-password?token=...`) that the mobile app intercepts.
  // Must be an absolute URL when set; falls back to BASE_URL in bootstrap.
  APP_BASE_URL: z.string().url().optional(),
  // Non-production only: pins the e-mail verification code to a fixed value so
  // the dev/staging app can be registered against without a working inbox.
  // Bootstrap ignores it when NODE_ENV is 'production', so setting it there is
  // inert rather than a live auth bypass.
  DEV_FIXED_REGISTRATION_CODE: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().regex(/^\d{6}$/, 'DEV_FIXED_REGISTRATION_CODE must be exactly 6 digits').optional(),
  ),
});

export type Env = z.infer<typeof EnvSchema>;

// WHY: parse once at boot — fail fast on bad config, never read process.env again.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
