import { Failure } from '@core/failure/failure';

export class ConflictFailure extends Failure {
  readonly code = 'conflict';
  constructor(readonly messageKey: string) {
    super();
  }
}