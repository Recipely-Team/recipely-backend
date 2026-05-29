import { Failure } from '@core/failure/failure';

export class TooManyRequestsFailure extends Failure {
  readonly code = 'too_many_requests';
  constructor(readonly messageKey: string) {
    super();
  }
}
