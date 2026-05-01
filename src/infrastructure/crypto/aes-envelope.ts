import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Wire-format envelope used for every /api/v1 request body and response body.
// `payload` carries `JSON.stringify({ data | error })` encrypted under
// AES-256-GCM with a fresh 12-byte IV per encryption. The 16-byte auth tag is
// concatenated to the ciphertext before base64 encoding so we transport a
// single value.
export interface Envelope {
  payload: string;
  iv: string;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export function keyFromHex(hex: string): Buffer {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error('AES key must decode to 32 bytes');
  }
  return buf;
}

export function encryptEnvelope(plain: unknown, key: Buffer): Envelope {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(plain), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    payload: Buffer.concat([ciphertext, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

export class EnvelopeDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeDecryptError';
  }
}

export function decryptEnvelope(envelope: Envelope, key: Buffer): unknown {
  if (typeof envelope.payload !== 'string' || typeof envelope.iv !== 'string') {
    throw new EnvelopeDecryptError('Envelope missing payload or iv');
  }
  const iv = Buffer.from(envelope.iv, 'base64');
  if (iv.length !== IV_BYTES) {
    throw new EnvelopeDecryptError(`IV must decode to ${IV_BYTES} bytes`);
  }
  const combined = Buffer.from(envelope.payload, 'base64');
  if (combined.length < AUTH_TAG_BYTES + 1) {
    throw new EnvelopeDecryptError('Payload shorter than auth tag');
  }
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_BYTES);
  const authTag = combined.subarray(combined.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch (err) {
    throw new EnvelopeDecryptError(
      `Failed to decrypt: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}
