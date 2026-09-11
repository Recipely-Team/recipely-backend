import { ASSISTANT_ANSWER_BUDGET_MS } from '@application/assistant/assistant-answer-budget';
import { AssistantCaller } from '@domain/assistant/assistant-caller';

/**
 * How long a typed turn may take, pinned against the clients that wait for it.
 *
 * The server has to be the one that gives up first: only it can answer with a
 * failure the caller knows how to say out loud. A client that times out first
 * has nothing to show but its own silence — or, for the phone's assistant, an
 * app opened for a question it will ask a second time.
 *
 * History: each provider once had 60 seconds of its own and Groq's SDK retried
 * twice on top, so one turn could outlive the app's 90; and the phone's
 * assistant waited through all of it on a Gemini "high demand" day.
 */

/** `AI_REQUEST_TIMEOUT_MS` in the app's `infrastructure/constants/api/api-timeouts.ts`. */
const APP_CLIENT_TIMEOUT_MS = 90_000;
/** `RecipelyAssistantClient.timeout` in the app's iOS module. */
const PHONE_CLIENT_TIMEOUT_MS = 15_000;
/** Gemini, then Groq — `assistant-responder-factory.ts`. */
const PROVIDERS = 2;
/** The slowest healthy Gemini turn measured on dev, 2026-09-11. */
const HEALTHY_TURN_MS = 4_000;

describe('how long a typed turn may take', () => {
  it('gives a tool-choosing app turn room to finish', () => {
    expect(ASSISTANT_ANSWER_BUDGET_MS[AssistantCaller.App] / PROVIDERS).toBeGreaterThanOrEqual(30_000);
  });

  it('still gives up before the app does', () => {
    expect(ASSISTANT_ANSWER_BUDGET_MS[AssistantCaller.App]).toBeLessThan(APP_CLIENT_TIMEOUT_MS);
  });

  it('answers the phone before it opens the app instead', () => {
    expect(ASSISTANT_ANSWER_BUDGET_MS[AssistantCaller.PhoneAssistant]).toBeLessThan(PHONE_CLIENT_TIMEOUT_MS);
  });

  it('leaves each provider enough for a healthy turn on the phone', () => {
    expect(ASSISTANT_ANSWER_BUDGET_MS[AssistantCaller.PhoneAssistant] / PROVIDERS).toBeGreaterThanOrEqual(HEALTHY_TURN_MS);
  });
});
