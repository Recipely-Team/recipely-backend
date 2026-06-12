import { Failure } from '@core/failure/failure';

export class ServiceUnavailableFailure extends Failure {
  readonly code = 'service_unavailable';
  constructor(readonly messageKey: string) {
    super();
  }
}
