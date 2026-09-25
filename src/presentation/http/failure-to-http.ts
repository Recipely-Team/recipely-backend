import type { Failure } from '@core/failure';
import type { HttpErrorBody } from '@presentation/http/http-error-body';
import type { HttpErrorResponse } from '@presentation/http/http-error-response';

export function failureToHttp(
  failure: Failure,
  translate?: (key: string, locale?: string) => string,
  locale?: string,
): HttpErrorResponse {
  const status = statusForCode(failure.code);
  const maybeField = (failure as { field?: unknown }).field;
  const maybeDetails = (failure as { details?: unknown }).details;
  const message = translate ? translate(failure.messageKey, locale) : failure.messageKey;
  // Only catalogue keys ride on the wire as `messageKey` — free-text messages
  // (Zod joins, upstream errors) must not leak as if they were stable keys.
  const isCatalogueKey = failure.messageKey.startsWith('errors.');
  const body: HttpErrorBody = {
    error: {
      code: failure.code,
      message,
      ...(isCatalogueKey ? { messageKey: failure.messageKey } : {}),
      ...(typeof maybeField === 'string' ? { field: maybeField } : {}),
      ...(isDetails(maybeDetails) ? { details: maybeDetails } : {}),
    },
  };
  return { status, body };
}

function isDetails(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function statusForCode(code: string): number {
  switch (code) {
    case 'validation':
      return 400;
    case 'unauthorized':
      return 401;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
    case 'forbidden':
      return 403;
    case 'unprocessable':
      return 422;
    case 'too_many_requests':
      return 429;
    case 'service_unavailable':
      return 503;
    default:
      return 500;
  }
}