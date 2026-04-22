import type { Failure } from '@core/failure';

export interface HttpErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly field?: string;
  };
}

export interface HttpErrorResponse {
  readonly status: number;
  readonly body: HttpErrorBody;
}

export function failureToHttp(failure: Failure): HttpErrorResponse {
  const status = statusForCode(failure.code);
  const maybeField = (failure as { field?: unknown }).field;
  const body: HttpErrorBody = {
    error: {
      code: failure.code,
      message: failure.message,
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
    default:
      return 500;
  }
}
