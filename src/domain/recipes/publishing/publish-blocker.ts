/**
 * What still stands between a recipe imported from a web page and the public
 * feed.
 *
 * @remarks
 * - **Each one is something the owner can clear themselves**: remove the
 *   site's photo, rewrite the ingredient list, rewrite the steps. The app
 *   renders them as a checklist, so the words are part of the wire contract.
 * - **Only a WEB import is gated.** A video import is the cook's own transcript
 *   of what they watched; a web page is someone else's published text and
 *   photo, copied verbatim. Saving it privately is always allowed — the gate is
 *   on showing it to everyone else.
 * - **Not in `check:structure` rule V's vocabulary list**: `photo`,
 *   `ingredients` and `instructions` are also field names all over the code
 *   base, so the rule would flag every recipe body. The const is still the one
 *   definition every site points at.
 */
export const PublishBlocker = {
  Photo: 'photo',
  Ingredients: 'ingredients',
  Instructions: 'instructions',
} as const;

export type PublishBlockerType = (typeof PublishBlocker)[keyof typeof PublishBlocker];
