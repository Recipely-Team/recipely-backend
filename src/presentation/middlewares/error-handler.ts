import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { Failure, UnknownFailure, ValidationFailure, isErrorKey } from '@core/failure';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { logger } from '@presentation/server/logger';
import type { TranslationService } from '@application/i18n/translation-service';

// Known multer fileFilter rejection messages — surface as 400 Validation instead of 500.
const MULTER_FILTER_MESSAGES = [
  'Only image files (jpeg, png, gif, webp) are allowed',
  'Only images (jpeg, png, gif, webp) and videos (mp4, webm, mov) are allowed',
];

/**
 * The single exit point for everything raised inside a request.
 *
 * Whatever comes in — a `Failure`, a `ZodError`, a Multer rejection, an arbitrary
 * exception — leaves as a catalogue key. The original text survives only in
 * `Failure.debug`, which is logged here and never serialized onto the wire.
 */
export function createErrorHandler(translationService: TranslationService) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const failure = toFailure(err);
    const { status, body } = failureToHttp(
      failure,
      (key, locale) => translationService.t(key, locale ?? req.locale ?? 'en'),
      req.locale,
    );
    if (status >= 500) {
      logger.error(
        {
          err,
          debug: failure.debug,
          code: failure.code,
          messageKey: failure.messageKey,
          url: req.url,
          method: req.method,
        },
        'Unhandled server error',
      );
    } else if (failure.debug !== undefined) {
      logger.warn(
        { debug: failure.debug, messageKey: failure.messageKey, url: req.url, method: req.method },
        'Request rejected',
      );
    }
    res.status(status).json(body);
  };
}

function toFailure(err: unknown): Failure {
  if (err instanceof Failure) return err;
  if (err instanceof ZodError) return fromZodError(err);
  if (err instanceof multer.MulterError) {
    return new ValidationFailure(
      err.code === 'LIMIT_FILE_SIZE'
        ? 'errors.validation.file_too_large'
        : 'errors.validation.invalid_request',
      err.field,
      `MulterError ${err.code}: ${err.message}`,
    );
  }
  if (err instanceof SyntaxError) {
    return new ValidationFailure('errors.validation.invalid_json', undefined, err.message);
  }
  // fileFilter in multer calls cb(new Error(message)) — that's a plain Error, not
  // MulterError, but it should be a 400 (bad client input) not a 500.
  if (err instanceof Error && MULTER_FILTER_MESSAGES.includes(err.message)) {
    return new ValidationFailure('errors.validation.file_type_invalid', 'image', err.message);
  }
  if (err instanceof Error) {
    return new UnknownFailure('errors.internal.unexpected', err.stack ?? err.message);
  }
  return new UnknownFailure('errors.internal.unexpected', `Non-Error thrown: ${String(err)}`);
}

/**
 * Zod's own messages are developer-facing English ("String must contain at least 1
 * character(s)"), untranslatable, and occasionally echo the rejected value — so
 * they are logged rather than sent. A validator that wants specific user copy opts
 * in by using a catalogue key as its message (see `ai.validators.ts`). The
 * offending `field` is still reported either way, so the client can highlight it.
 */
function fromZodError(err: ZodError): ValidationFailure {
  const first = err.issues[0];
  const field = first?.path.join('.') || undefined;
  const debug = err.issues
    .map(issue => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');

  const key =
    first !== undefined && isErrorKey(first.message)
      ? first.message
      : 'errors.validation.invalid_request';

  return new ValidationFailure(key, field, debug);
}
