import { Failure } from '@core/failure/failure';

export class ForbiddenFailure extends Failure {
  readonly code = 'forbidden';
  constructor(readonly messageKey: string = 'errors.forbidden') {
    super();
  }
}