import { AssistantAction } from '@domain/assistant/assistant-action';
import { toLiveLanguageCode } from '@infrastructure/assistant/live-language';

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
//
// Exported, because the text mode answers with the SAME instruction: the
// assistant must not become a different thing because the user typed rather
// than spoke.
export const ASSISTANT_SYSTEM_INSTRUCTION =
  'You drive the Recipely app for the user. Decide what to do and call runAction; ' +
  "never dictate the user's words into fields. Keep spoken replies to one short sentence. " +
  'Never compose recipe text yourself — call generateRecipe and let the app write it. ' +
  // "Find me a baklava recipe" produced a NEW one, because the only rule the
  // model had about recipes pointed at generateRecipe. Looking for something
  // that already exists and asking for something new are different requests.
  'Finding, looking for or showing an existing recipe is search — generateRecipe is only for ' +
  'making a new one the user asks you to invent. ' +
  // "Take me to my recipes" was answered by SEARCHING for "my recipes",
  // because nothing told the model that screens have names and search is for
  // recipes. Going somewhere and looking for something are different requests
  // and the model was given no way to tell them apart.
  'Going to, opening or showing a SCREEN is navigate with the screen name — never search. ' +
  // "Make the same recipe" was handed to the generator, which invented
  // something adjacent and called it the same. A copy is a copy.
  'Making a copy of a recipe that is open is duplicateRecipe — never generateRecipe, ' +
  'which would invent a different one. ' +
  'search is only ever for finding recipes by what is in them. ' +
  // Screen-scoped actions carry themselves to their screen now, so the model
  // must not decide it cannot do something because of where the user is.
  // Narrow on purpose. Recipe actions, attachPhoto and the draft actions do NOT
  // carry themselves — their subject would have to be invented to have
  // somewhere to go — so promising the model they do would stop it asking the
  // user to open the recipe first.
  // The app answers a destructive action by OPENING a confirmation sheet and
  // returning `awaiting`. Told nothing about it, the model reported the delete
  // as done while the sheet was still on screen and nothing had happened.
  'A result with `awaiting: true` means the app has asked the user to confirm and is WAITING. ' +
  'Say what you are about to do and ask them to confirm — never report it as done. ' +
  'They answer with confirm or cancel. ' +
  'Profile, settings, notifications, filters, sorting and importing can be run from any screen; ' +
  'the app opens whatever screen they need. ' +
  // The distinction is whether the subject exists yet. Told simply that drafts
  // need a draft open, the model asked the user to open one instead of doing
  // the obvious thing — the user had just asked it to make a new recipe.
  'To work on a NEW recipe, navigate to createRecipe first, then use the draft actions ' +
  '(setDraftField, addIngredient, addStep, publishDraft). ' +
  'To act on a recipe or draft that ALREADY EXISTS, it has to be open: open it with openRecipe ' +
  'or openDraft first, or ask the user which one they mean. Never start a new one to answer a ' +
  'question about an existing one. ' +
  // The screen line used to be a route and nothing else, so every reference to
  // something on screen was a phrase handed blindly to a handler, and "is
  // there anything here?" had no answer at all. It now names the rows.
  'Every result carries a screen line saying where the user is and what is on that screen. ' +
  'A list appears as `recipes=1) Name 2) Name`, or `=none` when it is empty; a recipe screen ' +
  'says its name and whether it is saved, liked and the user\'s own; the create screen says the ' +
  'draft\'s name, its ingredients and how many steps it has. Read it before answering anything ' +
  'about what the user can see, and pass back the name or the number from it. ' +
  // Asked out loud three times — "can you read me the ingredients of the draft
  // on screen" — and answered with silence, because nothing told the model
  // that the line it was already being given was an answer.
  'When the screen line already contains what they asked for, say it out loud — do not call an ' +
  'action to find out something you have been told. ' +
  'Rows in a list can be saved, unsaved, liked, unliked and — when they are the user\'s own — ' +
  'deleted, by naming the row: save, unsave, like, unlike, deleteRecipe. ' +
  // Asked for by the user in as many words: creating and deleting must be
  // announced and agreed to, not simply done. The app's own sheets already
  // gate the deletes; this is what makes the SPOKEN turn match them, and what
  // gates creating, which has no sheet of its own.
  'Making something and destroying something both need the user to agree first. ' +
  'Before generateRecipe, importRecipe, duplicateRecipe, publishDraft, deleteRecipe or ' +
  'deleteDraft, say in one sentence what you are about to create or delete and ask whether to ' +
  'go ahead. Call the action only after they say yes; if they say no, do nothing. ' +
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

/** The single `runAction` declaration, shared by both modes. */
export function assistantTools(): Record<string, unknown>[] {
  return [
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
                    // Named here, not left to be guessed. `setDraftField` takes a
                    // key the app defines, and with no list the model invented
                    // them — a user asking to raise the cooking time was told it
                    // could not be done, by an app that supports exactly that.
                    'For setDraftField it is `key=value`, where key is one of: ' +
                    'name, servings, prepTimeMinutes, cookTimeMinutes, difficulty, cuisine, category. ' +
                    'Times and servings are plain numbers of minutes or people. ' +
                    // Named for the same reason as the draft fields: without a
                    // list the model invented screen names, and navigate
                    // rejected every one of them.
                    'For navigate it is one of: recipes, createRecipe, importRecipe, myRecipes, ' +
                    'saved, liked, created, drafts, notifications, profile, editProfile, settings. ' +
                    'For updateProfile it is `key=value` with key name or bio. ' +
                    'For switchTab it is one of: saved, liked, created, drafts. ' +
                    "Always write it in the SAME LANGUAGE the user spoke, using the user's own words. " +
                    'Never translate it to English.',
                },
              },
              required: ['action'],
            },
          },
        ],
      },
    ];
}

/**
 * One voice, for the whole product.
 *
 * `Aoede` is the warmest of the prebuilt set, which suits a cooking assistant
 * better than the brighter ones. What matters more than the choice is that
 * there IS one: an assistant whose voice changes mid-session does not read as
 * the same assistant.
 */
const ASSISTANT_VOICE = 'Aoede';

export function buildLiveSetup(options: LiveSetupOptions): LiveSetup {
  return {
    model: options.model,
    generationConfig: {
      // Native-audio models accept only AUDIO; asking for TEXT as well is
      // rejected at setup. What the screen prints comes from the two
      // transcription streams below, which is why neither is optional.
      responseModalities: ['AUDIO'],
      speechConfig: {
        languageCode: toLiveLanguageCode(options.languageCode),
        // Pinned. Left unset the API picks a voice per session, so the person
        // on the other end changed every time the socket did — including on
        // the ten-minute reconnect, mid-conversation.
        voiceConfig: { prebuiltVoiceConfig: { voiceName: ASSISTANT_VOICE } },
      },
    },
    systemInstruction: { parts: [{ text: ASSISTANT_SYSTEM_INSTRUCTION }] },
    tools: assistantTools(),
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
