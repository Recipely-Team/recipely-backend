import { Failure } from '@core/failure/failure';

export class ForbiddenFailure extends Failure {
  readonly code = 'forbidden';
  constructor(override readonly message: string) {
    super();
  }
}
