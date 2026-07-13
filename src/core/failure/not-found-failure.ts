import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class NotFoundFailure extends Failure {
  readonly code = 'not_found';
  constructor(readonly messageKey: ErrorKey, debug?: string) {
    super(debug);
  }
}
