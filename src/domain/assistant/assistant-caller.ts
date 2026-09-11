/**
 * Who is waiting for a typed assistant turn.
 *
 * @remarks
 * - **It decides how long an answer may take, not what the answer is.** The two
 *   callers get the same assistant; they differ only in patience. The app shows a
 *   typing indicator and waits 90 seconds. The phone's own assistant — Siri, a
 *   launcher shortcut — gives up after 15 and opens the app instead, so an answer
 *   that arrives at second 20 is an answer nobody hears.
 * - **Known from the credential, never from the body.** The phone's assistant is
 *   the only holder of an intent-scoped token, so the auth middleware that told
 *   the two tokens apart is what names the caller. A body field would let the
 *   app claim a budget it does not have.
 */
export const AssistantCaller = {
  /** The app's own typed turn, authenticated with a session. */
  App: 'app',
  /** Siri or a launcher shortcut, authenticated with an intent-scoped token. */
  PhoneAssistant: 'phoneAssistant',
} as const;

export type AssistantCaller = (typeof AssistantCaller)[keyof typeof AssistantCaller];
