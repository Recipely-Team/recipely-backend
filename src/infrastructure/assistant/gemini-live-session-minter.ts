import { mintGeminiLiveToken, TokenFailureCode } from '@live-assistant/token-server';
import type { TokenFailure } from '@live-assistant/token-server';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import { fail, ok, type Result } from '@core/result/result';
import type {
  LiveSessionMinterInterface,
  MintLiveSessionRequest,
  MintedLiveSession,
} from '@application/assistant/ports/live-session-minter-interface';
import type { TieredKeyPool } from '@infrastructure/ai/keys/tiered-key-pool';
import {
  ASSISTANT_SYSTEM_INSTRUCTION,
  ASSISTANT_VOICE,
  assistantToolDefinitions,
} from '@infrastructure/assistant/assistant-persona';
import { toLiveLanguageCode } from '@infrastructure/assistant/live-language';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const SESSION_LIFETIME_MS = 30 * 60 * 1000;
const START_WINDOW_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface GeminiLiveSessionMinterConfig {
  /**
   * Round-robin over every configured key.
   *
   * Live sessions are rate-limited per key like every other Gemini call, and
   * the free tier's concurrent-session limit is undocumented — so spreading
   * sessions across the keys the operator holds is the one lever available
   * without a paid plan. An empty pool means voice is simply not configured,
   * which is a legitimate state: the app falls back to its text mode.
   */
  readonly keys: TieredKeyPool;
  readonly model: string;
}

/**
 * Mints ephemeral Live API credentials against Google.
 *
 * @remarks
 * - **The wire form is `@live-assistant/token-server`'s**, not this file's. The
 *   snake_case `auth_tokens` resource, the `bidiGenerateContentSetup` field and
 *   the constrained socket URL were measured here and then extracted into that
 *   package, which is where they are now documented and tested. Every documented
 *   alternative fails differently and none of them fail at compile time, so do
 *   not reimplement the request "closer to the docs" — read the package.
 * - **What stays here is what is ours**: which key a user's session is drawn
 *   from, the persona and vocabulary the token is minted with, and the single
 *   failure the app is allowed to see.
 * - **Every number is passed explicitly**, none left to the package's defaults.
 *   How long a session may run is a product decision this deployment makes
 *   against its own daily-seconds budget, and the request timeout bounds an
 *   Express request that is waiting on it; a default that moved underneath us
 *   would move both.
 * - **Failures are logged, never returned.** Google's message names the field it
 *   rejected, which is the only useful thing in it — and is not something a user
 *   can act on.
 */
export class GeminiLiveSessionMinter implements LiveSessionMinterInterface {
  constructor(private readonly config: GeminiLiveSessionMinterConfig) {}

  async mint(request: MintLiveSessionRequest): Promise<Result<MintedLiveSession, Failure>> {
    // The user's OWN key, not the next one in a rotation: one user hopping
    // across the pool can bench every quota the deployment holds, and a voice
    // session is long enough for that to happen inside a single conversation.
    const apiKey = this.config.keys.keyForUser(request.userId, request.tier);
    if (apiKey === null) {
      logger.warn('assistant_mint_no_key');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    // The package reports an unreachable Google as a code and `error.message`.
    // Pino's `err` serializer wants the object — the type and the stack are what
    // separate a DNS failure from a TLS one from our own timeout, and the sibling
    // text-mode event has logged them all along. A fetch that remembers what it
    // threw is what keeps the two halves of this subsystem the same shape.
    let thrown: unknown;
    const rememberingFetch: typeof fetch = async (input, init) => {
      try {
        return await fetch(input, init);
      } catch (error) {
        thrown = error;
        throw error;
      }
    };

    const minted = await mintGeminiLiveToken({
      fetch: rememberingFetch,
      timeoutMs: REQUEST_TIMEOUT_MS,
      apiKey,
      model: this.config.model,
      systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      tools: assistantToolDefinitions(),
      voiceName: ASSISTANT_VOICE,
      languageCode: toLiveLanguageCode(request.languageCode),
      sessionLifetimeMs: SESSION_LIFETIME_MS,
      startWindowMs: START_WINDOW_MS,
      ...(request.resumptionHandle !== undefined
        ? { resumptionHandle: request.resumptionHandle }
        : {}),
    });

    if (!minted.ok) {
      logMintFailure(minted.failure, thrown);
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    return ok(minted.value);
  }
}

/**
 * One log line per reason, under the names the deployment already greps for.
 *
 * @remarks
 * - The package answers with a code; these three events predate it and are what
 *   an operator looking at a voice outage searches on.
 * - **Exhaustive on purpose.** The vocabulary belongs to a dependency now, so a
 *   fourth code in a future release would otherwise be filed under whichever
 *   branch happened to be last — a wrong event name, with nothing failing. The
 *   `never` assignment turns that into a build error at the bump instead.
 */
function logMintFailure(failure: TokenFailure, thrown: unknown): void {
  switch (failure.code) {
    case TokenFailureCode.Unreachable:
      logger.error({ err: thrown, detail: failure.detail }, 'assistant_mint_unreachable');
      return;
    case TokenFailureCode.Rejected:
      logger.error({ status: failure.status, body: failure.detail }, 'assistant_mint_rejected');
      return;
    case TokenFailureCode.Malformed:
      logger.error({ body: failure.detail }, 'assistant_mint_malformed');
      return;
    default: {
      const unhandled: never = failure.code;
      logger.error({ code: unhandled, detail: failure.detail }, 'assistant_mint_failed');
    }
  }
}
