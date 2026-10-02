import { scrubLoggedUrl } from '@presentation/http/scrub-logged-url';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { Failure, UnknownFailure, ValidationFailure } from '@core/failure';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { logger } from '@presentation/server/logger';
import type { TranslationService } from '@application/i18n/translation-service';

// Known multer fileFilter rejection messages — surface as 400 Validation with a
// catalogue key so the response message is localized per request locale (the raw
// English literal must never reach a client).
const MULTER_FILTER_MESSAGE_KEYS: Record<string, string> = {
  'Only image files (jpeg, png, gif, webp) are allowed': 'errors.validation.invalid_image_type',
  'Only images (jpeg, png, gif, webp) and videos (mp4, webm, mov) are allowed':
    'errors.validation.invalid_media_type',
};

const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;

/** Which fields a schema refused, and why — without repeating what was in them. */
const zodFields = (err: ZodError): string[] =>
  err.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.code}`);

export function createErrorHandler(translationService: TranslationService) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const failure = toFailure(err);
    const { status, body } = failureToHttp(
      failure,
      (key, locale) => translationService.t(key, locale ?? req.locale ?? 'en'),
      req.locale,
    );
    if (status >= SERVER_ERROR) {
      logger.error({ err, url: scrubLoggedUrl(req.url), method: req.method }, 'Unhandled server error');
    } else if (status >= CLIENT_ERROR) {
      // A refusal the user can see and the operator cannot. Publishing a recipe
      // answered 400 with nothing anywhere naming the field, so working out
      // which one it was meant reading the client's code and guessing — for a
      // failure the server had fully diagnosed a millisecond earlier.
      //
      // Paths and codes, never the values: the response already carries the
      // detail to the person who sent it, and a log outlives the request by
      // months. `name: too_small` is what an operator needs; the name is not.
      logger.warn(
        {
          url: scrubLoggedUrl(req.url),
          method: req.method,
          status,
          ...(err instanceof ZodError ? { fields: zodFields(err) } : {}),
          // Only a real catalogue key. A ValidationFailure built from a
          // ZodError carries the composed message instead, and that spells out
          // what was IN the field ("received 'NOPE'") — which `fields` already
          // describes without quoting anyone's recipe back at them.
          ...(isCatalogueKey(failure.messageKey) ? { messageKey: failure.messageKey } : {}),
        },
        'request_rejected',
      );
    }
    res.status(status).json(body);
  };
}

// Mirrors the check in `failureToHttp` — a message is a translatable catalogue
// key only if it is one verbatim.
const isCatalogueKey = (message: string): boolean => message.startsWith('errors.');

function toFailure(err: unknown): Failure {
  if (err instanceof Failure) return err;
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join('.') || undefined;
    // Report every failing field, not just the first — err.issues[0] alone
    // silently drops any other simultaneously-invalid fields from the response.
    //
    // A lone catalogue key travels unprefixed: `failureToHttp` looks the message
    // up verbatim and only forwards `messageKey` when it starts with `errors.`,
    // so folding the path in ("prompt: errors.validation.prompt_too_long") turns
    // a translated message into a raw internal-looking string on the wire. The
    // field is already carried separately on the ValidationFailure.
    const soleCatalogueKey =
      err.issues.length === 1 && isCatalogueKey(err.issues[0]?.message ?? '')
        ? err.issues[0]?.message
        : undefined;
    const message = soleCatalogueKey ?? (err.issues.length > 0
      ? err.issues
          .map(issue => {
            const path = issue.path.join('.');
            return path ? `${path}: ${issue.message}` : issue.message;
          })
          .join('; ')
      : 'errors.validation.invalid_request');
    return new ValidationFailure(message, field);
  }
  if (err instanceof multer.MulterError) {
    // LIMIT_FILE_SIZE is the one users routinely hit — give it localized copy;
    // the rarer limits keep multer's message (still a 400, never a 500).
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ValidationFailure('errors.validation.file_too_large', err.field);
    }
    return new ValidationFailure(err.message, err.field);
  }
  if (err instanceof SyntaxError) {
    return new ValidationFailure('errors.validation.invalid_json');
  }
  // fileFilter in multer calls cb(new Error(message)) — that's a plain Error, not
  // MulterError, but it should be a 400 (bad client input) not a 500.
  if (err instanceof Error && err.message in MULTER_FILTER_MESSAGE_KEYS) {
    return new ValidationFailure(MULTER_FILTER_MESSAGE_KEYS[err.message] as string, 'image');
  }
  if (err instanceof Error) return new UnknownFailure(err.message);
  return new UnknownFailure('errors.validation.unknown');
}