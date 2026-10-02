import { createHash, randomBytes } from 'crypto';
import type { OneTimeCodeInterface } from '@application/instagram/ports/one-time-code-interface';

const CODE_BYTES = 32;

/** 256 random bits as base64url; stored as its SHA-256 so a database leak yields no usable code. */
export class RandomOneTimeCode implements OneTimeCodeInterface {
  mint(): string {
    return randomBytes(CODE_BYTES).toString('base64url');
  }

  hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
