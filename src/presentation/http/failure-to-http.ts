import type { Failure } from '@core/failure';

export interface HttpErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly messageKey?: string;
    readonly field?: string;
  };
}

export interface HttpErrorResponse {
  readonly status: number;
  readonly body: HttpErrorBody;
}

export function failureToHttp(
  failure: Failure,
  translate?: (key: string, locale?: string) => string,
  locale?: string,
): HttpErrorResponse {
  const status = statusForCode(failure.code);
  const maybeField = (failure as { field?: unknown }).field;
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
    },
  };
  return { status, body };
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