import { Failure } from '@core/failure/failure';

export class UnauthorizedFailure extends Failure {
  readonly code = 'unauthorized';
  constructor(readonly messageKey: string = 'errors.unauthorized.missing_token') {
    super();
  }
}