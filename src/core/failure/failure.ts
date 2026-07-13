import type { ErrorKey } from '@core/failure/error-key';

/**
 * Base of the failure hierarchy carried inside `Result<T, Failure>`.
 *
 * `messageKey` is deliberately typed as {@link ErrorKey}, not `string`: the only
 * thing a client may ever be told is a key from the catalogue, so a raw
 * exception message or an interpolated row id cannot be constructed in the
 * first place.
 */
export abstract class Failure {
  abstract readonly code: string;
  abstract readonly messageKey: ErrorKey;

  /**
   * Technical detail for logs only — exception text, the offending row id, a Zod
   * issue list. NEVER serialized onto the wire (see `failureToHttp`).
   */
  readonly debug?: string | undefined;

  constructor(debug?: string) {
    this.debug = debug;
  }
}
