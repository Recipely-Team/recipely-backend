import { hostname } from 'os';
import { z } from 'zod';

const WorkerEnvSchema = z.object({
  // Where the API lives. A worker talks to it over HTTPS and nothing else —
  // no database URL, no VCN membership, no shared disk. That is what makes
  // "add another worker" mean "run this image somewhere" and nothing more.
  WORKER_API_BASE_URL: z.string().url(),
  WORKER_SHARED_SECRET: z.string().min(32, 'WORKER_SHARED_SECRET must be at least 32 chars'),
  // Names this box in `claimed_by`. Defaults to the hostname, which is the
  // answer you want when a job stops moving and you have to go and look.
  WORKER_ID: z.string().min(1).max(64).default(hostname()),
  // How long to wait after finding nothing. The queue is empty almost always,
  // so this is the request rate at rest: 5 s is 12 requests a minute per box,
  // and the worst case a user waits for work to START is one interval.
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
  // Ceiling for the whole pipeline. Must stay under the API's lease or a
  // second worker takes the job while this one is still running it, and both
  // finish — see IMPORT_LEASE_MS.
  // A 3-minute video transcribes for longer; still under the 300 s claim lease.
  WORKER_IMPORT_TIMEOUT_MS: z.coerce.number().int().min(30_000).default(270_000),
  // Cloudflare Access service token, for an API hostname that sits behind
  // Access (dev does; production does not). Empty string is coerced to
  // undefined because Compose injects `""` for an unset variable, and a
  // half-set token is worse than none — Access rejects it and the worker gets
  // a login page it will try to parse as JSON.
  WORKER_CF_ACCESS_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  WORKER_CF_ACCESS_CLIENT_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().optional(),
  ),
  // The worker runs the import pipeline itself, so it holds its own keys —
  // never the API's. Singular for the boxes already deployed with it, plural
  // for as many as the operator wants: these providers rate-limit per key, and
  // a worker that runs out of quota mid-queue is a queue that stops.
  GROQ_API_KEY: z.string().optional(),
  GROQ_API_KEYS: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_API_KEYS: z.string().optional(),
  // The free tier, shared with the API. The worker never reads the PAID tier:
  // imports run unattended and must not spend money on their own initiative.
  GEMINI_API_KEYS_FREE: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEYS: z.string().optional(),
  // YouTube Data API v3 key: YouTube refuses yt-dlp from a server, so its
  // videos are read through the API instead. Optional — without it a YouTube
  // job fails with `provider_not_configured` and every other platform works.
  // Empty string is coerced to undefined because Compose injects `""`.
  YOUTUBE_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  LOG_LEVEL: z.string().default('info'),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

/**
 * Reads the worker's configuration, or refuses to start.
 *
 * @remarks
 * Deliberately a different schema from the API's. A worker that loaded the
 * API's env would demand a `DATABASE_URL` and a `JWT_SECRET` it has no use
 * for — and worse, a box that HAD them would be one config mistake away from
 * talking to the database directly, which is exactly the coupling this design
 * exists to avoid.
 */
export function loadWorkerEnv(): WorkerEnv {
  const parsed = WorkerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid worker configuration: ${issues}`);
  }
  return parsed.data;
}
