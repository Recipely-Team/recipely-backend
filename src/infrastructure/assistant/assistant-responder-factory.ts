import type { IAssistantResponder } from '@application/assistant/ports/i-assistant-responder';
import { GeminiAssistantResponder } from '@infrastructure/assistant/gemini-assistant-responder';
import { GroqAssistantResponder } from '@infrastructure/assistant/groq-assistant-responder';
import { FallbackAssistantResponder } from '@infrastructure/assistant/fallback-assistant-responder';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface AssistantResponderFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
  readonly geminiModel: string;
  readonly groqModel: string;
}

/**
 * Assembles the typed turn from whichever providers hold keys.
 *
 * @remarks
 * - **Gemini, then Groq**, the order the generator and the image moderator
 *   settled on. Gemini is the seat the assistant was written against; Groq is
 *   the one that answers when it cannot.
 * - **No keys at all still boots.** The use case answers
 *   `session_unavailable`, which is what the app already renders — a missing
 *   key must not be the reason a process refuses to start.
 * - **One provider needs no wrapper**, so a single-provider deployment behaves
 *   exactly as it did before there was a chain.
 */
export function createAssistantResponder(
  input: AssistantResponderFactoryInput,
): IAssistantResponder {
  const responders: IAssistantResponder[] = [];
  const providers: string[] = [];

  if (input.geminiKeys.size > 0) {
    responders.push(
      new GeminiAssistantResponder({ keys: input.geminiKeys, model: input.geminiModel }),
    );
    providers.push('gemini');
  }
  if (input.groqKeys.size > 0) {
    responders.push(new GroqAssistantResponder({ keys: input.groqKeys, model: input.groqModel }));
    providers.push('groq');
  }

  if (responders.length === 0) {
    logger.warn('No Gemini or Groq API keys — the typed assistant is unavailable until one is set');
  }

  logger.info(
    { providers, geminiKeyCount: input.geminiKeys.size, groqKeyCount: input.groqKeys.size },
    'assistant_responder_chain_ready',
  );

  return responders.length === 1
    ? responders[0]!
    : new FallbackAssistantResponder(responders);
}
