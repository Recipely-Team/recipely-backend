import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/** Who started a connect and where the app wants to land afterwards. */
export interface ConnectStateData {
  readonly userId: string;
  readonly returnTo: string;
}

/**
 * Signs the OAuth `state` that ties Instagram's callback back to the user who
 * started it — the callback carries no session, so this is its only proof.
 * Short-lived and of its own kind: it can never pass as a session token.
 */
export interface ConnectStateSignerInterface {
  sign(data: ConnectStateData): Promise<string>;
  verify(state: string): Promise<Result<ConnectStateData, Failure>>;
}
