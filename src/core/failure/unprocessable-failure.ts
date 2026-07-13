import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class UnprocessableFailure extends Failure {
  readonly code = 'unprocessable';
  constructor(
    readonly messageKey: ErrorKey,
    readonly field?: string,
    debug?: string,
  ) {
    super(debug);
  }
}
