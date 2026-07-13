import {
  ConflictFailure,
  UnknownFailure,
  UnprocessableFailure,
  ValidationFailure,
  Failure,
  type ErrorKey,
} from '@core/failure';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { logger } from '@presentation/server/logger';
import { createTestTranslationService } from '../../../helpers/translation';

jest.mock('@presentation/server/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));

const warn = logger.warn as unknown as jest.Mock;
const GENERIC_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';

const ts = createTestTranslationService();
const translate = (key: string, locale?: string): string => ts.t(key, locale);

beforeEach(() => warn.mockClear());

describe('failureToHttp — the wire shape', () => {
  it('carries the machine-readable key alongside the human message', () => {
    const { status, body } = failureToHttp(
      new ConflictFailure('errors.conflict.email_exists'),
      translate,
      'en',
    );

    expect(status).toBe(409);
    expect(body.error.code).toBe('conflict');
    expect(body.error.messageKey).toBe('errors.conflict.email_exists');
    expect(body.error.message).toBe('A user with this email already exists');
  });

  it('keeps `field` for validation failures', () => {
    const { body } = failureToHttp(
      new ValidationFailure('errors.validation.password_too_short', 'password'),
      translate,
      'en',
    );

    expect(body.error.field).toBe('password');
  });

  it('localizes the message but never the key', () => {
    const { body } = failureToHttp(
      new ConflictFailure('errors.conflict.email_exists'),
      (key, locale) => (locale === 'tr' ? 'Bu e-posta zaten kayıtlı' : ts.t(key)),
      'tr',
    );

    expect(body.error.messageKey).toBe('errors.conflict.email_exists');
    expect(body.error.message).toBe('Bu e-posta zaten kayıtlı');
  });

  it('never serializes the debug detail', () => {
    const { body } = failureToHttp(
      new UnknownFailure('errors.internal.unexpected', 'Corrupt recipe row 42: cuisine=KLINGON'),
      translate,
      'en',
    );

    expect(JSON.stringify(body)).not.toContain('KLINGON');
    expect(JSON.stringify(body)).not.toContain('42');
    expect(body.error).not.toHaveProperty('debug');
  });
});

describe('failureToHttp — fails closed', () => {
  // Bypasses the compiler the way a bug (or an `as any`) would, to prove the
  // runtime edge still refuses to pass the string through.
  class RogueFailure extends Failure {
    readonly code = 'unknown';
    readonly messageKey = 'Corrupt recipe row 7' as ErrorKey;
  }

  it('replaces an unknown key with the generic one, never the raw string', () => {
    const { status, body } = failureToHttp(new RogueFailure(), translate, 'en');

    expect(status).toBe(500);
    expect(body.error.messageKey).toBe('errors.internal.unexpected');
    expect(body.error.message).toBe(GENERIC_MESSAGE);
    expect(JSON.stringify(body)).not.toContain('Corrupt recipe row 7');
  });

  it('logs a warning naming the offending key', () => {
    failureToHttp(new RogueFailure(), translate, 'en');

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ messageKey: 'Corrupt recipe row 7' }),
      expect.stringContaining('unknown message key'),
    );
  });

  it('degrades a catalogue key that has no translation to the generic message', () => {
    // A key in the catalogue but missing from the locale file: i18next echoes the
    // key back, which must not be mistaken for copy.
    const { body } = failureToHttp(
      new ConflictFailure('errors.conflict.email_exists'),
      (key: string) => key,
      'en',
    );

    expect(body.error.messageKey).toBe('errors.internal.unexpected');
    expect(body.error.message).toBe(GENERIC_MESSAGE);
    expect(body.error.message).not.toBe('errors.conflict.email_exists');
  });

  it('emits prose, not a bare key, even with no translator at all', () => {
    const { body } = failureToHttp(new UnknownFailure());

    expect(body.error.message).toBe(GENERIC_MESSAGE);
  });
});

describe('failureToHttp — two 422s are told apart by their key', () => {
  it('distinguishes a moderation rejection from an unparseable AI response', () => {
    const moderation = failureToHttp(
      new UnprocessableFailure('errors.ai.prompt_rejected', 'prompt'),
      translate,
      'en',
    );
    const invalid = failureToHttp(
      new UnprocessableFailure('errors.ai.invalid_response', 'response'),
      translate,
      'en',
    );

    // Same coarse class, same status — the key is the only thing that separates them.
    expect(moderation.status).toBe(422);
    expect(invalid.status).toBe(422);
    expect(moderation.body.error.code).toBe(invalid.body.error.code);
    expect(moderation.body.error.code).toBe('unprocessable');

    expect(moderation.body.error.messageKey).toBe('errors.ai.prompt_rejected');
    expect(invalid.body.error.messageKey).toBe('errors.ai.invalid_response');
    expect(moderation.body.error.message).not.toBe(invalid.body.error.message);
  });
});
