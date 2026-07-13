import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class UnauthorizedFailure extends Failure {
  readonly code = 'unauthorized';
  constructor(
    readonly messageKey: ErrorKey = 'errors.unauthorized.missing_token',
    debug?: string,
  ) {
    super(debug);
  }
}
