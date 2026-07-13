import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class ForbiddenFailure extends Failure {
  readonly code = 'forbidden';
  constructor(readonly messageKey: ErrorKey = 'errors.forbidden', debug?: string) {
    super(debug);
  }
}
