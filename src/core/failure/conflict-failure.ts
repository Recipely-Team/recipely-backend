import { Failure } from '@core/failure/failure';

/**
 * The request is sound but the resource's current state refuses it.
 *
 * `details` is structured context the client can act on — for example the
 * checklist of what still blocks a publish. `failureToHttp` puts it on the
 * wire unchanged, so it must be plain JSON and never carry user content.
 */
export class ConflictFailure extends Failure {
  readonly code = 'conflict';
  constructor(
    readonly messageKey: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super();
  }
}
