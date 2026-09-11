import { AnswerAssistantMessageUseCase } from '@application/assistant/use-cases/answer-assistant-message-use-case';
import { ASSISTANT_ANSWER_BUDGET_MS } from '@application/assistant/assistant-answer-budget';
import type {
  AssistantMessageRequest,
  AssistantResponderInterface,
} from '@application/assistant/ports/assistant-responder-interface';
import { AssistantCaller } from '@domain/assistant/assistant-caller';
import { ok } from '@core/result/result';

/**
 * The deadline is decided once, here, from who is waiting. Before it, every
 * provider carried its own 60 seconds and the phone's assistant — which waits 15 —
 * sat through all of them on a bad Gemini day and heard nothing.
 */
describe('AnswerAssistantMessageUseCase — the deadline', () => {
  const capture = () => {
    const seen: AssistantMessageRequest[] = [];
    const responder: AssistantResponderInterface = {
      answer: async (request) => {
        seen.push(request);
        return ok({ reply: 'tamam' });
      },
    };
    return { seen, responder };
  };

  it.each([AssistantCaller.App, AssistantCaller.PhoneAssistant])(
    'gives the %s its own budget, counted from now',
    async (caller) => {
      const { seen, responder } = capture();

      await new AnswerAssistantMessageUseCase(responder, () => 1_000).execute({
        message: 'merhaba',
        languageCode: 'tr',
        caller,
      });

      expect(seen[0]?.deadline).toBe(1_000 + ASSISTANT_ANSWER_BUDGET_MS[caller]);
    },
  );
});
