import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class ValidationFailure extends Failure {
  readonly code = 'validation';
  constructor(
    readonly messageKey: ErrorKey,
    readonly field?: string,
    debug?: string,
  ) {
    super(debug);
  }
}
