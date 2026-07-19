import type { Env } from '@infrastructure/config/env';

// The only hosts allowed to issue a predictable verification code. An
// allowlist, not a production blocklist: for an account-takeover primitive
// the default must be deny, so anything unrecognised — a raw IP, a new
// environment, a trailing-dot hostname, a typo — is refused rather than
// waved through. (This deployment has had BASE_URL pointed at a bare IP
// before, which a blocklist would have failed open on.)
const NON_PRODUCTION_HOSTS: readonly string[] = [
  'localhost',
  '127.0.0.1',
  'dev-api.recipely.net',
  'dev.recipely.net',
];

function isNonProductionHost(url: string | undefined): boolean {
  if (url === undefined) return false;
  try {
    // Trailing dots are equivalent in DNS but not to string equality.
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return NON_PRODUCTION_HOSTS.includes(hostname);
  } catch {
    return false;
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
 * discriminator, and it has to be recognised as a known non-production host —
 * "unknown" means refused.
 */
export function resolveFixedRegistrationCode(env: Env): string | null {
  const code = env.DEV_FIXED_REGISTRATION_CODE;
  if (code === undefined) return null;
  if (!isNonProductionHost(env.BASE_URL)) return null;
  // A dev API paired with a production app URL is a misconfiguration; refuse
  // rather than guess which half is right.
  if (env.APP_BASE_URL !== undefined && !isNonProductionHost(env.APP_BASE_URL)) return null;
  return code;
}
