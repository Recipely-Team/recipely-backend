import type { ErrorKey } from '@core/failure/error-key';
import { Failure } from '@core/failure/failure';

export class ConflictFailure extends Failure {
  readonly code = 'conflict';
  constructor(readonly messageKey: ErrorKey, debug?: string) {
    super(debug);
  }
}
