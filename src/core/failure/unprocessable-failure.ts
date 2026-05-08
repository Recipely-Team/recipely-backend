import { Failure } from '@core/failure/failure';

export class UnprocessableFailure extends Failure {
  readonly code = 'unprocessable';
  constructor(
    readonly messageKey: string,
    readonly field?: string,
  ) {
    super();
  }
}
