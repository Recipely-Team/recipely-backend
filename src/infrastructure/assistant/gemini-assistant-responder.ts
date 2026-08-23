import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import { fail, ok, type Result } from '@core/result/result';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type {
  AssistantMessageReply,
  AssistantMessageRequest,
  IAssistantResponder,
} from '@application/assistant/ports/i-assistant-responder';
import { ASSISTANT_SYSTEM_INSTRUCTION, assistantTools } from '@infrastructure/assistant/live-setup';
import { logger } from '@presentation/server/logger';

/**
 * Answers one typed message with a single `generateContent` call.
 *
 * @remarks
 * - **The same instruction and the same tool as the voice session.** They come
 *   from `live-setup` rather than being restated, so the assistant does not
 *   become a different thing when the user types — the words it may choose
 *   from and the way it is told to behave are one definition.
 * - **A different model on purpose.** The Live models only speak; a typed turn
 *   wants a text model, and the cheapest one that can call a tool is the right
 *   choice for a mode whose whole point is being affordable when voice is not.
 * - **The screen line rides in the message**, exactly as it rides in a tool
 *   result during a session: a separate turn would double the cost of the one
 *   thing the model needs to know.
 */
const GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * How many times one typed turn may be attempted, and how long to wait between.
 *
 * Measured, not guessed: the dev box's logs for a single afternoon carry five
 * `assistant_message_rejected` lines, every one of them a 503 reading "this
 * model is currently experiencing high demand", plus one request that timed
 * out. Each of those was one attempt and then a shrug — the user typed a
 * sentence, watched the screen say the request had not gone through, and had
 * no way to know that asking again would have worked.
 *
 * Three attempts fit comfortably inside the app's 90s budget for an AI call
 * (`AI_REQUEST_TIMEOUT_MS`) even if every one of them runs to the full
 * per-attempt timeout, so a retry can never turn a slow answer into a
 * cancelled one.
 */
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [400, 1_200] as const;

/**
 * Upstream statuses worth asking again about.
 *
 * Deliberately narrow. A 400 is our request being wrong and a 403 is our key
 * being wrong; both would fail identically three times and just cost the user
 * the wait. These are the ones that mean "not right now".
 */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Why one attempt did not produce an answer, and whether asking again may. */
type AttemptFailure = { readonly transient: boolean; readonly status: number | null };

const RATE_LIMITED = 429;
const NO_STATUS = null;

const wait = (ms: number): Promise<void> => new Promise((resume) => setTimeout(resume, ms));

export interface GeminiAssistantResponderConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

export class GeminiAssistantResponder implements IAssistantResponder {
  constructor(private readonly config: GeminiAssistantResponderConfig) {}

  async answer(request: AssistantMessageRequest): Promise<Result<AssistantMessageReply, Failure>> {
    const userText =
      request.screenContext === undefined
        ? request.message
        : `${request.message}\n\n[${request.screenContext}]`;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const apiKey = this.config.keys.next();
      if (apiKey === null) {
        logger.warn('assistant_message_no_key');
        return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
      }

      const outcome = await this.attempt(apiKey, userText);
      if (!('transient' in outcome)) return ok(outcome);

      // A quota belongs to the KEY, so the pool is told; everything else here
      // is the provider's own weather and says nothing about which key asked.
      if (outcome.status === RATE_LIMITED) this.config.keys.penalise(apiKey);
      if (!outcome.transient) break;

      const backoff = RETRY_BACKOFF_MS[attempt];
      if (backoff !== undefined) await wait(backoff);
    }

    return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
  }

  /** One call: the reply, or why it did not arrive and whether to ask again. */
  private async attempt(
    apiKey: string,
    userText: string,
  ): Promise<AssistantMessageReply | AttemptFailure> {
    let response: Response;
    try {
      response = await fetch(`${GENERATE_URL}/${this.config.model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM_INSTRUCTION }] },
          tools: assistantTools(),
          contents: [{ role: 'user', parts: [{ text: userText }] }],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      logger.error({ err: error }, 'assistant_message_unreachable');
      return { transient: true, status: NO_STATUS };
    }

    const text = await response.text();
    if (!response.ok) {
      const transient = RETRYABLE_STATUSES.has(response.status);
      logger.error(
        { status: response.status, transient, body: text.slice(0, 500) },
        'assistant_message_rejected',
      );
      return { transient, status: response.status };
    }

    const parsed = readReply(text);
    if (parsed === null) {
      // A candidate with no text and no call is usually a turn cut short —
      // a safety stop or a token ceiling — not a permanently wrong request,
      // so it is worth one more roll rather than a dead end.
      logger.error({ body: text.slice(0, 300) }, 'assistant_message_malformed');
      return { transient: true, status: NO_STATUS };
    }
    return parsed;
  }
}

/**
 * Pulls the spoken part and the chosen action out of one candidate.
 *
 * A turn may carry both — "opening it now" beside the `runAction` — and either
 * alone. A reply with neither is treated as malformed rather than shown as an
 * empty bubble.
 */
function readReply(payload: string): AssistantMessageReply | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const candidates = (parsed as { candidates?: unknown[] }).candidates ?? [];
  const parts = ((candidates[0] as { content?: { parts?: unknown[] } })?.content?.parts ?? []) as {
    text?: string;
    functionCall?: { name?: string; args?: Record<string, unknown> };
  }[];

  let reply = '';
  let action: AssistantMessageReply['action'];
  for (const part of parts) {
    if (typeof part.text === 'string') reply += part.text;
    const call = part.functionCall;
    if (call !== undefined && typeof call.name === 'string') {
      const name = call.args?.['action'];
      const arg = call.args?.['arg'];
      if (typeof name === 'string') {
        action = typeof arg === 'string' ? { name, arg } : { name };
      }
    }
  }

  if (reply === '' && action === undefined) return null;
  return action === undefined ? { reply: reply.trim() } : { reply: reply.trim(), action };
}
