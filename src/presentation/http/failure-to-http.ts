import { isErrorKey, type ErrorKey, type Failure } from '@core/failure';
import { logger } from '@presentation/server/logger';

/**
 * The only error shape that ever goes on the wire.
 *
 * `code` is the coarse class the HTTP status is derived from (`validation`,
 * `unauthorized`, …); `messageKey` is the stable, machine-readable catalogue key
 * the client branches on — two errors can share a `code` (both 422) and still be
 * told apart by their key. `message` is human copy in the caller's locale, for
 * clients that do not know the key.
 *
 * `Failure.debug` is deliberately absent: diagnostic detail is logged, never sent.
 */
export interface HttpErrorBody {
  readonly error: {
    readonly code: string;
    readonly messageKey: ErrorKey;
    readonly message: string;
    readonly field?: string;
  };
}

export interface HttpErrorResponse {
  readonly status: number;
  readonly body: HttpErrorBody;
}

export type Translate = (key: string, locale?: string) => string;

const GENERIC_KEY: ErrorKey = 'errors.internal.unexpected';

/**
 * Last-resort copy for the impossible case where even the generic key has no
 * translation. It exists so `message` is always human-readable prose — a bare
 * catalogue key must never be rendered to an end user.
 */
const GENERIC_MESSAGE = 'Something went wrong on our end. Please try again in a moment.';

/**
 * Translates a {@link Failure} into the wire shape, failing closed.
 *
 * Anything that is not a known, translatable catalogue key degrades to the generic
 * key and generic copy, and is logged as a warning naming the offending key — so a
 * bug at a call site can never become an information leak.
 */
export function failureToHttp(
  failure: Failure,
  translate?: Translate,
  locale?: string,
): HttpErrorResponse {
  const status = statusForCode(failure.code);
  const maybeField = (failure as { field?: unknown }).field;
  const { messageKey, message } = resolveMessage(failure, translate, locale);

  const body: HttpErrorBody = {
    error: {
      code: failure.code,
      messageKey,
      message,
      ...(typeof maybeField === 'string' ? { field: maybeField } : {}),
    },
  };
  return { status, body };
}

function resolveMessage(
  failure: Failure,
  translate: Translate | undefined,
  locale: string | undefined,
): { messageKey: ErrorKey; message: string } {
  const key: string = failure.messageKey;

  if (!isErrorKey(key)) {
    logger.warn({ messageKey: key, code: failure.code }, 'Failure carried an unknown message key');
    return { messageKey: GENERIC_KEY, message: translateOrGeneric(GENERIC_KEY, translate, locale) };
  }

  const translated = translate?.(key, locale);
  // i18next echoes the key back when it has no entry for it — that is a miss, and
  // shipping the key as prose would be exactly the leak this function exists to stop.
  if (translated === undefined || translated === key || translated.trim() === '') {
    logger.warn({ messageKey: key, locale }, 'Message key has no translation');
    return { messageKey: GENERIC_KEY, message: translateOrGeneric(GENERIC_KEY, translate, locale) };
  }

  return { messageKey: key, message: translated };
}

function translateOrGeneric(
  key: ErrorKey,
  translate: Translate | undefined,
  locale: string | undefined,
): string {
  const translated = translate?.(key, locale);
  if (translated === undefined || translated === key || translated.trim() === '') {
    return GENERIC_MESSAGE;
  }
  return translated;
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
