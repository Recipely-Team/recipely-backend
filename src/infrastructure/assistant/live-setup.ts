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
  // WHO, before what. The voice is pinned (see ASSISTANT_VOICE) but the persona
  // was not, and a voice is only half of who someone is: with nothing but
  // operational rules the model invented a manner each session — formal one
  // time, chatty the next, occasionally naming itself something new. The report
  // was "konuştuğum kişi rastgele değişiyor", and it was about the person, not
  // the timbre. One fixed identity, described in the same few words every
  // session, is what makes it the same assistant twice.
  // A persona, not a character to play. The first version said "warm" and the
  // model heard permission to perform: it started putting on an accent nobody
  // asked for. Manner is described in terms of what it does NOT do, because
  // that is the half a model will otherwise fill in for itself.
  'You are Şef, the cooking assistant inside Recipely. Speak in the plain, ' +
  'neutral register of the language you are using — no accent, no dialect, no ' +
  'regional colour, no performed warmth or enthusiasm, no catchphrases. Be brief ' +
  'and matter-of-fact. You have no other name and no backstory — if asked who ' +
  'you are, say you are Şef and move on. ' +
  'You drive the Recipely app for the user. Decide what to do and call runAction; ' +
  "never dictate the user's words into fields. Keep spoken replies to one short sentence. " +
  'Never compose recipe text yourself — call generateRecipe and let the app write it. ' +
  // "Find me a baklava recipe" produced a NEW one, because the only rule the
  // model had about recipes pointed at generateRecipe. Looking for something
  // that already exists and asking for something new are different requests.
  'Finding, looking for or showing an existing recipe is search — generateRecipe is only for ' +
  'making a new one the user asks you to invent. ' +
  // "Bana baklava tarifi lazım" was answered by INVENTING a baklava, in about a
  // second, over a library that already had several. Wanting a recipe is not
  // the same as wanting a NEW recipe, and the earlier rule only separated the
  // two when the user said "find" out loud. Most people do not.
  'When the user asks for a recipe of something without saying it must be new, ALWAYS search ' +
  'first and tell them what you found. Only offer to create one when the search returns ' +
  'nothing, or when they say they want a new or different one. Never call generateRecipe in ' +
  'the same turn as the request — creating a recipe takes a minute of their time and is not ' +
  'something to start on a guess. ' +
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
  'Profile, settings, notifications, filters, sorting and importing can be run from any screen; ' +
  'the app opens whatever screen they need. Anything about a specific recipe or a draft needs ' +
  'that recipe or draft to be open — ask the user to open it if it is not. ' +
  // The verbatim rule is right for free text — a search query, a recipe name, a
  // prompt — and wrong for the actions whose `arg` is a fixed word. Told only
  // "verbatim", the model sent Turkish where an enum was expected, and "en üste
  // kaydır" arrived as `up`: a valid direction that scrolls one screen, after
  // which the model reported that it had gone to the top. `top` and `bottom`
  // existed the whole time; nothing had ever told it so.
  'For search text, recipe names and prompts, put the user\'s own words in `arg` ' +
  'verbatim — never translate them. ' +
  'Some actions take a FIXED word instead, and for those send the word, not what ' +
  'the user said: scroll takes exactly up, down, top or bottom ("en üste" is ' +
  'top, "en alta" is bottom); setPreference takes language=<two-letter code>, ' +
  'theme=light|dark|system, or palette=<the name shown on the swatch>; addFilter ' +
  'and removeFilter take cuisine=, category=, difficulty= or maxTime=; sort takes ' +
  'one of popular, rating, time, newest, mostLiked. ' +
  'Reply in their language.';

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
                    'For markRead it is the row number or what the user called the notification. ' +
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
