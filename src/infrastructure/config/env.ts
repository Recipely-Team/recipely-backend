import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  // WHY: AdminJS session cookie. Default false because the production host
  // currently serves plain HTTP — `secure: true` would make the browser
  // refuse to send the cookie back, leaving every login redirect-loop on
  // the login page. Flip to true when an HTTPS proxy lands in front.
  COOKIE_SECURE: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .default(false),
  // 32-byte (64 hex chars) AES-256-GCM key used to encrypt request/response
  // payloads under /api/v1. Generate once with `openssl rand -hex 32` and share
  // the same value with the mobile client. Mobile binary leaks compromise the
  // key — TLS is the proper transport-layer fix; this is a soft wrapper.
  API_AES_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'API_AES_KEY must be 64 hex chars (32 bytes)'),
  // Base URL for generating file upload URLs (e.g., http://localhost:3000 in dev)
  BASE_URL: z.string().url().optional().or(z.string().startsWith('http').optional()),
  // AI recipe generation — provider/model can be swapped without redeploying
  // the use case. Bootstrap reads these to select the adapter.
  AI_PROVIDER: z.enum(['gemini', 'anthropic', 'groq']).default('groq'),
  AI_MODEL: z.string().min(1).default('llama-3.3-70b-versatile'),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
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
  // Base URL of the web app for generating password-reset links.
  APP_BASE_URL: z.string().optional(),
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
