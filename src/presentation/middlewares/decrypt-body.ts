import type { NextFunction, Request, Response } from 'express';
import { ValidationFailure } from '@core/failure';
import {
  decryptEnvelope,
  EnvelopeDecryptError,
  type Envelope,
} from '@infrastructure/crypto/aes-envelope';
import { failureToHttp } from '@presentation/http/failure-to-http';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

function isEnvelope(body: unknown): body is Envelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Envelope).payload === 'string' &&
    typeof (body as Envelope).iv === 'string'
  );
}

// Decrypts the AES-GCM envelope wrapping every /api/v1 request body. GET/DELETE
// requests pass through unchanged. The plaintext is `{ data: <T> }` and the
// inner `data` is what downstream Zod validators see on req.body.
export function createDecryptBodyMiddleware(key: Buffer) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!METHODS_WITH_BODY.has(req.method)) {
      next();
      return;
    }
    // DEBUG: remove before ship
    // eslint-disable-next-line no-console
    console.log(`[decrypt-body] ${req.method} ${req.path} | content-type: ${req.headers['content-type'] ?? 'none'} | isMultipart: ${!!req.is('multipart/form-data')}`);
    // Multipart requests are parsed by multer downstream; their body is never
    // an AES envelope, so skip decryption and let the route handler proceed.
    if (req.is('multipart/form-data')) {
      next();
      return;
    }
    if (!isEnvelope(req.body)) {
      const { status, body } = failureToHttp(
        new ValidationFailure('Request body must be an encrypted envelope'),
      );
      res.status(status).json(body);
      return;
    }
    try {
      const plain = decryptEnvelope(req.body, key);
      if (typeof plain !== 'object' || plain === null || !('data' in plain)) {
        throw new EnvelopeDecryptError('Decrypted plaintext missing `data`');
      }
      req.body = (plain as { data: unknown }).data;
      next();
    } catch (err) {
      const message = err instanceof EnvelopeDecryptError ? err.message : 'Invalid envelope';
      const { status, body } = failureToHttp(new ValidationFailure(message));
      res.status(status).json(body);
    }
  };
}
