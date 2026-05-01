import { Failure } from '@core/failure/failure';

export class NotFoundFailure extends Failure {
  readonly code = 'not_found';
  constructor(readonly messageKey: string) {
    super();
  }
}