import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import { fail, ok, type Result } from '@core/result/result';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type {
  AssistantMessageReply,
  AssistantMessageRequest,
  AssistantResponderInterface,
} from '@application/assistant/ports/assistant-responder-interface';
import { ASSISTANT_SYSTEM_INSTRUCTION, assistantTools } from '@infrastructure/assistant/live-setup';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';
import { timeUntil } from '@infrastructure/assistant/time-until';

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
 * - **It stops at the request's deadline, not at a limit of its own.** How long
 *   a turn may take depends on who is waiting, which only the use case knows;
 *   see `ASSISTANT_ANSWER_BUDGET_MS`.
 * - **The screen line rides in the message**, exactly as it rides in a tool
 *   result during a session: a separate turn would double the cost of the one
 *   thing the model needs to know.
 */
const GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export interface GeminiAssistantResponderConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

export class GeminiAssistantResponder implements AssistantResponderInterface {
  constructor(private readonly config: GeminiAssistantResponderConfig) {}

  async answer(request: AssistantMessageRequest): Promise<Result<AssistantMessageReply, Failure>> {
    if (timeUntil(request.deadline) <= 0) {
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }
    const apiKey = this.config.keys.next();
    if (apiKey === null) {
      logger.warn('assistant_message_no_key');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    const userText =
      request.screenContext === undefined
        ? request.message
        : `${request.message}\n\n[${request.screenContext}]`;

    const startedAt = Date.now();
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${GENERATE_URL}/${this.config.model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM_INSTRUCTION }] },
          tools: assistantTools(),
          contents: [{ role: 'user', parts: [{ text: userText }] }],
        }),
        signal: AbortSignal.timeout(timeUntil(request.deadline)),
      });
      // Inside the try: the abort also covers reading the body, and a deadline
      // that fires after the headers must still come back as a failure the
      // chain can hand to the next provider, not as a thrown 500.
      text = await response.text();
    } catch (error) {
      // Our own deadline is not the key's fault; only a real failure moves it
      // down the order the app's typed turn shares.
      if (!isTimeout(error)) this.config.keys.fail(apiKey);
      logger.error({ err: error }, 'assistant_message_unreachable');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    if (!response.ok) {
      // A refusal from the provider is this key being no use right now, whether
      // it is a quota or a capacity spike — it moves down the order either way.
      this.config.keys.fail(apiKey);
      logger.error({ status: response.status, body: text.slice(0, 500) }, 'assistant_message_rejected');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    this.config.keys.succeed(apiKey, Date.now() - startedAt);

    const parsed = readReply(text);
    if (parsed === null) {
      logger.error({ body: text.slice(0, 300) }, 'assistant_message_malformed');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }
    return ok(parsed);
  }
}

/**
 * `AbortSignal.timeout` rejects with a `TimeoutError` DOMException. Read by name,
 * not `instanceof Error`: a DOMException from another realm is not one.
 */
function isTimeout(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'TimeoutError';
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
