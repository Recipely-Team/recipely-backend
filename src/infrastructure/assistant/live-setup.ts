import { AssistantAction } from '@domain/assistant/assistant-action';

/**
 * The complete configuration a voice session runs on.
 *
 * It lives here — on the server, baked into the ephemeral token at mint time —
 * because that is the only place the Live API reads it from. Measured against
 * the API: the client's own `setup` frame is a trigger whose CONTENTS ARE
 * DISCARDED. Sending the full setup from the device and sending `{ model }`
 * produce sessions identical down to the prompt token count, and a token minted
 * without tools, connected by a client that declares them, runs a session with
 * no tools and no error to say so.
 *
 * That makes this file the single source of what the assistant is. It also
 * means changing the assistant's behaviour is a deploy here, not an app
 * release — which is the reason the model id is configuration too.
 */

// Re-sent on every session and on every resumption, so its length is a
// per-session tax rather than a one-off. What the assistant may DO is
// communicated by the action names, which the model reads from the enum
// anyway; spelling out examples here would pay for the same information twice.
//
// "verbatim — never translate" is load-bearing rather than emphasis. Asked in
// Turkish for a recipe, the model rendered `arg` as "chicken and yogurt": the
// tool argument is passed to the recipe generator, so a translated one quietly
// swaps the language a user's own phrasing is worked from.
const SYSTEM_INSTRUCTION =
  'You drive the Recipely app for the user. Decide what to do and call runAction; ' +
  "never dictate the user's words into fields. Keep spoken replies to one short sentence. " +
  'Never compose recipe text yourself — call generateRecipe and let the app write it. ' +
  "Put the user's own words in `arg` verbatim — never translate them. Reply in their language.";

export interface LiveSetup {
  readonly model: string;
  readonly generationConfig: Record<string, unknown>;
  readonly systemInstruction: Record<string, unknown>;
  readonly tools: Record<string, unknown>[];
  readonly inputAudioTranscription: Record<string, never>;
  readonly outputAudioTranscription: Record<string, never>;
  readonly contextWindowCompression: Record<string, unknown>;
  readonly sessionResumption: Record<string, unknown>;
}

export interface LiveSetupOptions {
  readonly model: string;
  readonly languageCode: string;
  /** Continues a session the server asked the client to leave. */
  readonly resumptionHandle?: string;
}

export function buildLiveSetup(options: LiveSetupOptions): LiveSetup {
  return {
    model: options.model,
    generationConfig: {
      // Native-audio models accept only AUDIO; asking for TEXT as well is
      // rejected at setup. What the screen prints comes from the two
      // transcription streams below, which is why neither is optional.
      responseModalities: ['AUDIO'],
      speechConfig: { languageCode: options.languageCode },
    },
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    tools: [
      {
        // ONE tool, not one per screen. The Live API fixes its tool list at
        // setup and will not take a new one mid-session, and this assistant
        // walks between screens while talking — so a per-screen list would
        // mean reconnecting, and paying setup and context again, on every
        // navigation. One tool with an action enum costs ~200 tokens against
        // the 1.5–2k that a tool apiece would.
        functionDeclarations: [
          {
            name: 'runAction',
            description: 'Perform one action in the Recipely app.',
            parameters: {
              type: 'OBJECT',
              properties: {
                action: { type: 'STRING', enum: Object.values(AssistantAction) },
                arg: {
                  // The "same language" rule lives HERE and not only in the
                  // system instruction, because the instruction alone did not
                  // hold: asked in Turkish, the model still wrote `arg` as
                  // "chicken, yogurt". A field description is read at the
                  // moment the field is filled, which is where it sticks. It
                  // matters because this argument is what the recipe generator
                  // works from — translating it quietly swaps the language the
                  // user's own phrasing is interpreted in.
                  type: 'STRING',
                  description:
                    'The action argument: a recipe prompt, a search query, a field value, or an id. ' +
                    "Always write it in the SAME LANGUAGE the user spoke, using the user's own words. " +
                    'Never translate it to English.',
                },
              },
              required: ['action'],
            },
          },
        ],
      },
    ],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // Without a sliding window the whole conversation is re-sent as context on
    // every turn, so a ten-minute session costs with the square of its length
    // rather than with its length.
    contextWindowCompression: { slidingWindow: {} },
    // The connection is dropped roughly every ten minutes. A handle lets the
    // next one continue without paying setup and context again — and because
    // the handle has to be minted in, that reconnect is also where the budget
    // gets re-checked.
    sessionResumption:
      options.resumptionHandle !== undefined ? { handle: options.resumptionHandle } : {},
  };
}
