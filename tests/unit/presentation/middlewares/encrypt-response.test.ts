import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { ConflictFailure } from '@core/failure';
import { decryptEnvelope } from '@infrastructure/crypto/aes-envelope';
import { createEncryptResponseMiddleware } from '@presentation/middlewares/encrypt-response';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { createTestTranslationService } from '../../../helpers/translation';

const KEY = randomBytes(32);
const ts = createTestTranslationService();

function runMiddleware(body: unknown): unknown {
  const originalJson = jest.fn();
  const res = { json: originalJson } as unknown as Response;
  createEncryptResponseMiddleware(KEY)({} as Request, res, jest.fn());

  res.json(body);

  const envelope = originalJson.mock.calls[0]?.[0];
  return decryptEnvelope(envelope, KEY);
}

describe('createEncryptResponseMiddleware', () => {
  it('carries messageKey through the encrypted error envelope', () => {
    const { body } = failureToHttp(
      new ConflictFailure('errors.conflict.recipe_exists'),
      (key, locale) => ts.t(key, locale),
      'en',
    );

    const plaintext = runMiddleware(body) as { error: Record<string, string> };

    expect(plaintext.error.code).toBe('conflict');
    expect(plaintext.error.messageKey).toBe('errors.conflict.recipe_exists');
    expect(plaintext.error.message).toBe('A recipe with this source URL already exists');
  });

  it('wraps a success body under `data`, not `error`', () => {
    const plaintext = runMiddleware({ id: 'recipe-1' }) as { data: unknown };

    expect(plaintext).toEqual({ data: { id: 'recipe-1' } });
  });

  it('does not mistake a success body that merely has an `error` field for an envelope', () => {
    // The old check was a bare `'error' in body`, which would have swallowed this
    // payload's other fields; the shape check keeps it a success body.
    const plaintext = runMiddleware({ error: 'user-facing form state', id: 'x' }) as {
      data: unknown;
    };

    expect(plaintext).toEqual({ data: { error: 'user-facing form state', id: 'x' } });
  });
});
