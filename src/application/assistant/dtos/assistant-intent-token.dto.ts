/**
 * The credential the app hands to the OS assistant, and when to replace it.
 *
 * `expiresAt` is an absolute ISO instant rather than a duration, because the
 * consumer is native code reading a shared container weeks later: a "valid for
 * 30 days" it cannot date is a token it has to either trust forever or throw
 * away on every launch.
 */
export interface AssistantIntentTokenDto {
  readonly token: string;
  readonly expiresAt: string;
}
