import Groq from 'groq-sdk';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type {
  AssistantMessageReply,
  AssistantMessageRequest,
  AssistantResponderInterface,
} from '@application/assistant/ports/assistant-responder-interface';
import { AssistantAction } from '@domain/assistant/assistant-action';
import { ASSISTANT_SYSTEM_INSTRUCTION } from '@infrastructure/assistant/live-setup';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * The one tool, in the shape Groq's API takes.
 *
 * Built from the same {@link AssistantAction} enum the Gemini seat declares, so
 * the two providers can never be offered different vocabularies — that is the
 * whole failure mode this file has to avoid, because a fallback that answers
 * with a word the app cannot dispatch is worse than no fallback.
 */
const tools = () => [
  {
    type: 'function' as const,
    function: {
      name: 'runAction',
      description: 'Perform one action in the Recipely app.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: Object.values(AssistantAction) },
          arg: {
            type: 'string',
            description:
              "The action argument: a recipe prompt, a search query, a field value, or an id. " +
              "Always write it in the SAME LANGUAGE the user spoke, using the user's own words.",
          },
        },
        required: ['action'],
      },
    },
  },
];

export interface GroqAssistantResponderConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

/**
 * The assistant's second seat, for when Gemini cannot answer.
 *
 * @remarks
 * - **Why it exists.** Recipe generation and photo moderation each got a
 *   fallback provider; the typed assistant did not, so a Gemini capacity spike
 *   — "This model is currently experiencing high demand", which is what
 *   production was serving when this was written — took the typed assistant
 *   down for everyone. Voice is unaffected: it runs on the Live API, a
 *   different product with its own capacity.
 * - **The SAME system instruction, from the same file.** A second seat with its
 *   own prompt would be a second assistant, and which one a user met would
 *   depend on whose capacity was free at the time. Everything that makes Şef
 *   Şef is loaded from `live-setup`, not restated here.
 * - **The same action enum, too**, built off `AssistantAction` rather than
 *   written out. A fallback that answers with a word the app cannot dispatch
 *   is worse than no fallback: it turns an outage into a wrong action.
 * - **Tool calling, not JSON mode.** The reply and the action are two different
 *   channels in this contract — a turn may carry either or both — and JSON mode
 *   would flatten them into one object the model has to remember to shape.
 */
export class GroqAssistantResponder implements AssistantResponderInterface {
  constructor(private readonly config: GroqAssistantResponderConfig) {}

  async answer(request: AssistantMessageRequest): Promise<Result<AssistantMessageReply, Failure>> {
    const apiKey = this.config.keys.next();
    if (apiKey === null) {
      logger.warn('groq_assistant_message_no_key');
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }

    const userText =
      request.screenContext === undefined
        ? request.message
        : `${request.message}\n\n[${request.screenContext}]`;

    const startedAt = Date.now();
    try {
      const completion = await new Groq({ apiKey, timeout: REQUEST_TIMEOUT_MS }).chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: ASSISTANT_SYSTEM_INSTRUCTION },
          { role: 'user', content: userText },
        ],
        tools: tools(),
        tool_choice: 'auto',
        temperature: 0,
      });

      const choice = completion.choices[0]?.message;
      const reply = choice?.content ?? '';
      const call = choice?.tool_calls?.[0];

      const action = readAction(call?.function?.arguments);
      // Neither spoken nor acted is a malformed turn, not a silent one — the
      // same judgement the Gemini seat makes, so a fallback cannot quietly
      // answer with an empty bubble.
      if (reply.trim().length === 0 && action === undefined) {
        this.config.keys.fail(apiKey);
        logger.error({ model: this.config.model }, 'groq_assistant_message_malformed');
        return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
      }

      this.config.keys.succeed(apiKey, Date.now() - startedAt);
      return ok(action === undefined ? { reply } : { reply, action });
    } catch (err) {
      this.config.keys.fail(apiKey);
      logger.error(
        {
          err,
          errMessage: err instanceof Error ? err.message : String(err),
          status: (err as { status?: unknown }).status,
          model: this.config.model,
        },
        'groq_assistant_message_failed',
      );
      return fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'));
    }
  }
}

/** The chosen action, or undefined when the model only spoke. */
function readAction(rawArguments: string | undefined): AssistantMessageReply['action'] {
  if (rawArguments === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const { action, arg } = parsed as { action?: unknown; arg?: unknown };
  if (typeof action !== 'string') return undefined;

  return typeof arg === 'string' ? { name: action, arg } : { name: action };
}
