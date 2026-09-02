import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type {
  AssistantMessageReply,
  AssistantResponderInterface,
} from '@application/assistant/ports/assistant-responder-interface';

export interface AnswerAssistantMessageInput {
  readonly message: string;
  readonly languageCode: string;
  readonly screenContext?: string;
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
 */
export class AnswerAssistantMessageUseCase {
  constructor(private readonly responder: AssistantResponderInterface) {}

  async execute(input: AnswerAssistantMessageInput): Promise<Result<AssistantMessageReply, Failure>> {
    const answered = await this.responder.answer({
      message: input.message,
      languageCode: input.languageCode,
      ...(input.screenContext !== undefined ? { screenContext: input.screenContext } : {}),
    });
    if (!answered.ok) return answered;

    return ok(answered.value);
  }
}
