import type { AssistantKeyTierType } from '@domain/assistant/assistant-key-tier';
import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface MintLiveSessionRequest {
  readonly languageCode: string;
  readonly resumptionHandle?: string;
  /**
   * Whose session this is. The minter serves each user from ONE key rather
   * than rotating, so a single heavy user cannot bench every quota the
   * deployment owns and leave nothing for anyone else.
   */
  readonly userId: string;
  /** Which pool to draw from. Free unless the user is on a paid plan. */
  readonly tier: AssistantKeyTierType;
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
