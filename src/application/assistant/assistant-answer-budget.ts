import { AssistantCaller } from '@domain/assistant/assistant-caller';

/**
 * How long the whole provider chain may spend on one typed turn, per caller.
 *
 * @remarks
 * - **A budget for the chain, not for each provider.** Each provider used to get
 *   60 seconds of its own, and Groq's SDK retried twice on top — so a Gemini
 *   timeout followed by a slow fallback could run past three minutes, while the
 *   app gives up at 90. The server is meant to give up FIRST, because only it
 *   can answer with a failure the app knows how to say out loud; a chain of
 *   independent timeouts made that impossible. `FallbackAssistantResponder`
 *   shares what is left of this budget between the providers it has not tried.
 * - **The app: 80 of its 90 seconds.** Ten seconds of headroom for the network
 *   and the envelope, and still long enough for a tool-choosing turn that takes
 *   twenty — which is ordinary, and which the old 15-second limit cut off.
 * - **The phone's assistant: 12 of its 15.** Measured on dev: with Gemini
 *   answering "503 high demand" or timing out, every Siri question waited out
 *   the full 60 seconds and reached no one, because the iOS client had already
 *   given up and opened the app. Twelve seconds split between two providers is
 *   six each — enough for a healthy Gemini turn (1.5–4 s measured) and for
 *   Groq to answer when Gemini cannot.
 */
export const ASSISTANT_ANSWER_BUDGET_MS: Readonly<Record<AssistantCaller, number>> = {
  [AssistantCaller.App]: 80_000,
  [AssistantCaller.PhoneAssistant]: 12_000,
};
