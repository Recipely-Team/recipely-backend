import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const VERSION = 'v1';
const KEY_INFO = 'recipely/instagram-access-token/v1';

/**
 * **Encrypts Instagram access tokens at rest** (AES-256-GCM).
 *
 * @remarks
 * - The key is derived (HKDF-SHA256) from the server's JWT secret with its own
 *   label, so no second secret has to be provisioned, and it is not
 *   `API_AES_KEY` — that one ships inside the mobile app.
 * - Stored as `v1.<iv>.<ciphertext+tag>` (base64url); the version prefix lets a
 *   later key or algorithm coexist with old rows.
 * - Rotating JWT_SECRET makes stored tokens unreadable: those creators simply
 *   reconnect (decrypt answers `null`, the connection reads as expired).
 */
export class InstagramTokenCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), KEY_INFO, KEY_BYTES));
  }

  encrypt(token: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return [VERSION, iv.toString('base64url'), body.toString('base64url')].join('.');
  }

  /** The token, or `null` when the value was not written with this key. */
  decrypt(stored: string): string | null {
    const [version, iv, body] = stored.split('.');
    if (version !== VERSION || iv === undefined || body === undefined) return null;
    try {
      const raw = Buffer.from(body, 'base64url');
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
      return Buffer.concat([decipher.update(raw.subarray(0, raw.length - TAG_BYTES)), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
