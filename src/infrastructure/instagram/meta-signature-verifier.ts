import { createHmac, timingSafeEqual } from 'crypto';
import { fail, ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import type { MetaSignatureVerifierInterface } from '@application/instagram/ports/meta-signature-verifier-interface';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * **Checks that a request really came from Meta**, with the Instagram app
 * secret. Both comparisons are constant-time.
 */
export class MetaSignatureVerifier implements MetaSignatureVerifierInterface {
  constructor(private readonly appSecret: string) {}

  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (signatureHeader?.startsWith(SIGNATURE_PREFIX) !== true) return false;
    const expected = createHmac('sha256', this.appSecret).update(rawBody).digest();
    const given = Buffer.from(signatureHeader.slice(SIGNATURE_PREFIX.length), 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  parseSignedRequest(signedRequest: string): Result<{ readonly igUserId: string }, Failure> {
    const [signature, payload] = signedRequest.split('.');
    if (signature === undefined || payload === undefined) return fail(invalid());
    const expected = createHmac('sha256', this.appSecret).update(payload).digest();
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return fail(invalid());
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { user_id?: unknown };
      const userId = typeof data.user_id === 'number' ? String(data.user_id) : data.user_id;
      return typeof userId === 'string' && userId.length > 0 ? ok({ igUserId: userId }) : fail(invalid());
    } catch {
      return fail(invalid());
    }
  }
}

const invalid = (): Failure => new UnauthorizedFailure('errors.instagram.signature_invalid');
