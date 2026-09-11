import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type {
  AssistantMessageReply,
  AssistantMessageRequest,
  AssistantResponderInterface,
} from '@application/assistant/ports/assistant-responder-interface';
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
 * - **What is left of the deadline is shared, not handed to the first seat.**
 *   Each provider may spend an equal part of the remaining time, and the last
 *   one may spend all of it. Given the whole deadline, a slow Gemini would use
 *   it up and Groq would never be asked — which is exactly the moment Groq is
 *   there for. A provider that fails fast leaves its unused share to the next.
 */
export class FallbackAssistantResponder implements AssistantResponderInterface {
  constructor(
    private readonly responders: readonly AssistantResponderInterface[],
    private readonly now: () => number = Date.now,
  ) {}

  async answer(request: AssistantMessageRequest): Promise<Result<AssistantMessageReply, Failure>> {
    let lastFailure: Failure = new ServiceUnavailableFailure('errors.assistant.session_unavailable');

    for (const [index, responder] of this.responders.entries()) {
      const now = this.now();
      const remaining = request.deadline - now;
      if (remaining <= 0) {
        logger.warn(
          { responder: responder.constructor.name, untried: this.responders.length - index },
          'assistant_deadline_reached — not asking the rest',
        );
        break;
      }
      const seatsLeft = this.responders.length - index;
      const result = await responder.answer({
        ...request,
        deadline: Math.min(request.deadline, now + Math.floor(remaining / seatsLeft)),
      });
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
