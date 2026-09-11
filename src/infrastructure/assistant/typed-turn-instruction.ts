import { ASSISTANT_SYSTEM_INSTRUCTION } from '@infrastructure/assistant/live-setup';

/**
 * The system instruction for a typed turn: the assistant's one instruction,
 * plus the language the app is set to.
 *
 * @remarks
 * - **"Reply in their language" was not enough on its own.** A voice session
 *   carries the language in `speechConfig`; a typed turn carried it nowhere, so
 *   the model had to guess from one short message — and the instruction's own
 *   examples are Turkish. Measured on dev: Groq answered "How long should I boil
 *   an egg?" in Turkish for an app set to `en`. Gemini guessed right more often,
 *   which is why it went unnoticed until the fallback began answering Siri.
 * - **The user's words still win.** The code is the tie-breaker for a message
 *   too short or too mixed to tell, not an order to translate someone who wrote
 *   in another language on purpose.
 */
export function typedTurnInstruction(languageCode: string): string {
  return (
    `${ASSISTANT_SYSTEM_INSTRUCTION}\n\n` +
    `The app is set to the language "${languageCode}". Reply in the language the user ` +
    `wrote in; when that is unclear from their message, reply in "${languageCode}".`
  );
}
