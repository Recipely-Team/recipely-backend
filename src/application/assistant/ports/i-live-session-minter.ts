import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface MintLiveSessionRequest {
  readonly languageCode: string;
  readonly resumptionHandle?: string;
}

export interface MintedLiveSession {
  /** The ephemeral credential, passed to the socket in place of an API key. */
  readonly token: string;
  readonly model: string;
  readonly wsUrl: string;
  readonly expiresAt: string;
}

/**
 * Port for minting a single-use credential the device can open a Live socket
 * with, so audio never travels through this server and the long-lived API key
 * never reaches a phone.
 */
export interface ILiveSessionMinter {
  mint(request: MintLiveSessionRequest): Promise<Result<MintedLiveSession, Failure>>;
}
