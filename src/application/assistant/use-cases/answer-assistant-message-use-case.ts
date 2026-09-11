import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type {
  AssistantMessageReply,
  AssistantResponderInterface,
} from '@application/assistant/ports/assistant-responder-interface';
import { ASSISTANT_ANSWER_BUDGET_MS } from '@application/assistant/assistant-answer-budget';
import type { AssistantCaller } from '@domain/assistant/assistant-caller';

export interface AnswerAssistantMessageInput {
  readonly message: string;
  readonly languageCode: string;
  readonly screenContext?: string;
  readonly caller: AssistantCaller;
}

/**
 * Answers one typed message.
 *
 * @remarks
 * - **Not charged against the voice budget.** That budget counts seconds of an
 *   open microphone, and this holds none — it is the mode the app falls back to
 *   when those seconds are gone, so charging it there would close the exit as
 *   well as the door. The rate limit on the route is what bounds it instead.
 * - **Stateless by design.** No history is carried, which is what makes it a
 *   fraction of a spoken turn; the app keeps the transcript for the user to
 *   read, not for the model to be told about.
 * - **The deadline is set here, once, from who is waiting.** Providers never
 *   choose their own limits any more; see `ASSISTANT_ANSWER_BUDGET_MS`.
 */
export class AnswerAssistantMessageUseCase {
  constructor(
    private readonly responder: AssistantResponderInterface,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(input: AnswerAssistantMessageInput): Promise<Result<AssistantMessageReply, Failure>> {
    const answered = await this.responder.answer({
      message: input.message,
      languageCode: input.languageCode,
      ...(input.screenContext !== undefined ? { screenContext: input.screenContext } : {}),
      deadline: this.now() + ASSISTANT_ANSWER_BUDGET_MS[input.caller],
    });
    if (!answered.ok) return answered;

    return ok(answered.value);
  }
}
