import express, { type Express } from 'express';
import { createEncryptResponseMiddleware } from '@presentation/middlewares/encrypt-response';

const JSON_BODY_LIMIT = '256kb';

// Mounts the /api/v1 response envelope BEFORE the JSON parser, so a body the
// parser refuses ("The request body could not be read") is answered inside the
// envelope like every other API reply. With the envelope mounted on the v1
// router instead, that one error went out as plain JSON: the parser runs first
// and hands it to the app-level error handler, outside the router.
export function mountJsonParsing(app: Express, aesKey: Buffer): void {
  app.use('/api/v1', createEncryptResponseMiddleware(aesKey));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
}
