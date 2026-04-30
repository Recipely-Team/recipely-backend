import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Failure, UnknownFailure, ValidationFailure } from '@core/failure';
import { failureToHttp } from '@presentation/http/failure-to-http';
import type { TranslationService } from '@application/i18n/translation-service';

export function createErrorHandler(translationService: TranslationService) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const failure = toFailure(err);
    const { status, body } = failureToHttp(
      failure,
      (key, locale) => translationService.t(key, locale ?? req.locale ?? 'en'),
      req.locale,
    );
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
  if (err instanceof Error) return new UnknownFailure(err.message);
  return new UnknownFailure('errors.validation.unknown');
}