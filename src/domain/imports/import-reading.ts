/**
 * What an import read, kept beside the draft so the user can check the recipe
 * against it before saving.
 *
 * @remarks
 * - **`suggested`**: the post showed a dish but no recipe, so the model wrote
 *   one for that dish. The draft must say so; the user did not get the post's
 *   own recipe.
 * - **`sourceText`**: the caption and transcript the model was given, in the
 *   post's own language, capped. The original stays one tap away from a
 *   translated draft.
 * - **`guessedIngredients` / `guessedSteps`**: indexes of lines the model filled
 *   in rather than read (an amount the video never states, a step it inferred).
 *   Those are the lines worth a second look.
 */
export interface ImportReading {
  readonly suggested: boolean;
  readonly sourceText?: string | undefined;
  readonly guessedIngredients: readonly number[];
  readonly guessedSteps: readonly number[];
}
