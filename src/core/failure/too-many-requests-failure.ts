import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class TooManyRequestsFailure extends Failure {
  readonly code = 'too_many_requests';
  constructor(readonly messageKey: ErrorKey, debug?: string) {
    super(debug);
  }
}
