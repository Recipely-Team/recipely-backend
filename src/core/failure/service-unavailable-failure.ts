import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class ServiceUnavailableFailure extends Failure {
  readonly code = 'service_unavailable';
  constructor(readonly messageKey: ErrorKey, debug?: string) {
    super(debug);
  }
}
