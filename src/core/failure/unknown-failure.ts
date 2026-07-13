import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

/**
 * A server-side defect the client is told nothing about.
 *
 * The message key defaults to the generic catch-all and callers are expected to
 * leave it there — the interesting part (exception text, offending row id) goes
 * into `debug`, which is logged and never serialized.
 */
export class UnknownFailure extends Failure {
  readonly code = 'unknown';
  constructor(
    readonly messageKey: ErrorKey = 'errors.internal.unexpected',
    debug?: string,
  ) {
    super(debug);
  }
}
