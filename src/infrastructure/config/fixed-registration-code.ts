import type { Env } from '@infrastructure/config/env';

// Deployments that must never issue a predictable verification code, matched
// on the host of the public base URL.
const PRODUCTION_HOSTS: readonly string[] = ['api.recipely.net', 'recipely.net'];

function isProductionHost(url: string | undefined): boolean {
  if (url === undefined) return false;
  try {
    return PRODUCTION_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    // An unparseable BASE_URL tells us nothing, so assume the worst.
    return true;
  }
}

/**
 * The fixed registration code, or null when it must not be used.
 *
 * A fixed verification code is a full account-takeover primitive, so it needs
 * a guard the env var itself cannot switch off. NODE_ENV is useless here: the
 * dev host runs NODE_ENV=production too (it shares docker-compose.yml with
 * prod), so gating on it would disable the code on the only box that wants it
 * while proving nothing about the real one. The public base URL is the honest
 * discriminator — prod is the only deployment serving api.recipely.net.
 */
export function resolveFixedRegistrationCode(env: Env): string | null {
  const code = env.DEV_FIXED_REGISTRATION_CODE;
  if (code === undefined) return null;
  if (isProductionHost(env.BASE_URL) || isProductionHost(env.APP_BASE_URL)) return null;
  return code;
}
