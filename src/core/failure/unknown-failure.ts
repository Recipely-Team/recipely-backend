import { Failure } from '@core/failure/failure';

export class UnknownFailure extends Failure {
  readonly code = 'unknown';
  constructor(readonly messageKey: string = 'errors.validation.unknown') {
    super();
  }
}