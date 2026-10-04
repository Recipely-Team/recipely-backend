import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/**
 * Meta's request authenticity checks, keyed by the app secret.
 *
 * @remarks
 * - Webhooks carry `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>`.
 * - The data-deletion and deauthorize callbacks carry a `signed_request`
 *   (`<base64url sig>.<base64url JSON>`), whose JSON names the Instagram user.
 */
export interface MetaSignatureVerifierInterface {
  verifyWebhook(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  parseSignedRequest(signedRequest: string): Result<{ readonly igUserId: string }, Failure>;
}
