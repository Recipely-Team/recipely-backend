import type { NextFunction, Request, Response } from 'express';
import { encryptEnvelope } from '@infrastructure/crypto/aes-envelope';
import type { HttpErrorBody } from '@presentation/http/failure-to-http';

/**
 * Recognises the one error shape `failureToHttp` produces.
 *
 * The check is structural rather than a bare `'error' in body` so that a body
 * that merely happens to have an `error` field cannot masquerade as an error
 * envelope — every real one carries `code`, `messageKey` and `message`.
 */
function isErrorEnvelope(body: unknown): body is HttpErrorBody {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const error = (body as { error: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  const { code, messageKey, message } = error as Record<string, unknown>;
  return typeof code === 'string' && typeof messageKey === 'string' && typeof message === 'string';
}

// Wraps every /api/v1 response so the client only sees the encrypted envelope.
// Success bodies become `{ data: <body> }` plaintext; failure bodies (already
// shaped as `{ error: ... }` by failureToHttp) keep that key. The HTTP status
// code stays untouched so the client can branch on data-vs-error without
// peeking at the plaintext first.
export function createEncryptResponseMiddleware(key: Buffer) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const plaintext = isErrorEnvelope(body) ? { error: body.error } : { data: body };
      const envelope = encryptEnvelope(plaintext, key);
      return originalJson(envelope);
    };
    next();
  };
}
