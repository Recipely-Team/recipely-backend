import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { Failure, UnknownFailure, ValidationFailure } from '@core/failure';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { logger } from '@presentation/server/logger';
import type { TranslationService } from '@application/i18n/translation-service';

// Known multer fileFilter rejection messages — surface as 400 Validation instead of 500.
const MULTER_FILTER_MESSAGES = [
  'Only image files (jpeg, png, gif, webp) are allowed',
  'Only images (jpeg, png, gif, webp) and videos (mp4, webm, mov) are allowed',
];

export function createErrorHandler(translationService: TranslationService) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const failure = toFailure(err);
    const { status, body } = failureToHttp(
      failure,
      (key, locale) => translationService.t(key, locale ?? req.locale ?? 'en'),
      req.locale,
    );
    if (status >= 500) {
      logger.error({ err, url: req.url, method: req.method }, 'Unhandled server error');
    }
    res.status(status).json(body);
  };
}

function toFailure(err: unknown): Failure {
  if (err instanceof Failure) return err;
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join('.') || undefined;
    return new ValidationFailure(first?.message ?? 'errors.validation.invalid_request', field);
  }
  if (err instanceof multer.MulterError) {
    return new ValidationFailure(err.message, err.field);
  }
  if (err instanceof SyntaxError) {
    return new ValidationFailure('errors.validation.invalid_json');
  }
  // fileFilter in multer calls cb(new Error(message)) — that's a plain Error, not
  // MulterError, but it should be a 400 (bad client input) not a 500.
  if (err instanceof Error && MULTER_FILTER_MESSAGES.includes(err.message)) {
    return new ValidationFailure(err.message, 'image');
  }
  if (err instanceof Error) return new UnknownFailure(err.message);
  return new UnknownFailure('errors.validation.unknown');
}