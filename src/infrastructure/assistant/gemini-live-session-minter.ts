import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import { fail, ok, type Result } from '@core/result/result';
import type {
  ILiveSessionMinter,
  MintLiveSessionRequest,
  MintedLiveSession,
} from '@application/assistant/ports/i-live-session-minter';
import type { TieredKeyPool } from '@infrastructure/ai/keys/tiered-key-pool';
import { buildLiveSetup } from '@infrastructure/assistant/live-setup';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Mints ephemeral Live API credentials against Google.
 *
 * @remarks
 * Every constant below was measured against the live API rather than read from
 * the documentation, because each documented form fails differently:
 *
 * - The resource is **`auth_tokens`**, snake_case. The camelCase `authTokens`
 *   the docs use answers **404** with an empty body.
 * - The setup goes in **`bidiGenerateContentSetup`**. `liveConnectConstraints`,
 *   which the docs name, does not exist — the API answers "Cannot find field".
 * - The socket is a **different RPC method**, `BidiGenerateContentConstrained`,
 *   on **v1alpha**, authenticated with `access_token=<the full auth_tokens/…
 *   name>`. Connecting to the ordinary `BidiGenerateContent` with the token as
 *   `key=` answers "API key not valid"; with `access_token=` it answers
 *   "Method doesn't allow unregistered callers".
 *
 * The two lifetimes do different jobs. `expireTime` is how long the SESSION may
 * run on this credential; `newSessionExpireTime` is how long the client has to
 * START one. A short start window is what keeps a leaked token worthless, while
 * the session window has to cover a real conversation.
 */
const MINT_URL = 'https://generativelanguage.googleapis.com/v1alpha/auth_tokens';
const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

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

export class GeminiLiveSessionMinter implements ILiveSessionMinter {
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

    const now = Date.now();
    const expiresAt = new Date(now + SESSION_LIFETIME_MS).toISOString();
    const body = {
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: new Date(now + START_WINDOW_MS).toISOString(),
      bidiGenerateContentSetup: buildLiveSetup({
        model: this.config.model,
        languageCode: request.languageCode,
        ...(request.resumptionHandle !== undefined
          ? { resumptionHandle: request.resumptionHandle }
          : {}),
      }),
    };

    let response: Response;
    try {
      response = await fetch(`${MINT_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error({ err: error }, 'assistant_mint_unreachable');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    const text = await response.text();
    if (!response.ok) {
      // The body carries which field Google rejected, which is the only useful
      // thing here — and it is never shown to a user, so it is logged, not
      // returned.
      logger.error({ status: response.status, body: text.slice(0, 500) }, 'assistant_mint_rejected');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    const name = readTokenName(text);
    if (name === null) {
      logger.error({ body: text.slice(0, 200) }, 'assistant_mint_malformed');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    return ok({ token: name, model: this.config.model, wsUrl: WS_URL, expiresAt });
  }
}

function readTokenName(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const name = (parsed as { name?: unknown }).name;
    return typeof name === 'string' && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}
