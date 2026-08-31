import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type {
  AssistantMessageReply,
  AssistantMessageRequest,
  IAssistantResponder,
} from '@application/assistant/ports/i-assistant-responder';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Asks each provider in turn and takes the first answer.
 *
 * @remarks
 * - **Why the typed assistant needed one.** Generation and photo moderation
 *   each got a second provider; this did not, so a Gemini capacity spike —
 *   "This model is currently experiencing high demand", which production was
 *   serving when this was written — took typing to the assistant down for
 *   everyone. Voice was unaffected, because it runs on the Live API, a
 *   different product with its own capacity. So the mode that exists to work
 *   when voice cannot was the one with no fallback.
 * - **Every failure falls through, unlike the moderators'.** There is no such
 *   thing as a refusal here: a responder either produced a turn or it did not,
 *   and both `ServiceUnavailableFailure` shapes it can return mean the same
 *   thing — nobody answered. The image moderator deliberately does NOT fall
 *   through on a verdict, because there a rejection IS an answer.
 * - **The last failure is what comes back**, so the message the user sees
 *   belongs to the provider that had the final word.
 */
export class FallbackAssistantResponder implements IAssistantResponder {
  constructor(private readonly responders: readonly IAssistantResponder[]) {}

  async answer(request: AssistantMessageRequest): Promise<Result<AssistantMessageReply, Failure>> {
    let lastFailure: Failure = new ServiceUnavailableFailure('errors.assistant.session_unavailable');

    for (const responder of this.responders) {
      const result = await responder.answer(request);
      if (result.ok) return result;

      lastFailure = result.failure;
      logger.warn(
        { responder: responder.constructor.name },
        'assistant_responder_unavailable — trying the next one',
      );
    }

    return fail(lastFailure);
  }
}
