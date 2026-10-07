/**
 * A code the app turns into its own copy — never model-written text, so no
 * sentence about health can reach the user from the parse.
 */
export const MealParseNote = {
  NothingDetected: 'nothing_detected',
  SomeEstimated: 'some_estimated',
} as const;

export type MealParseNoteType = (typeof MealParseNote)[keyof typeof MealParseNote];
