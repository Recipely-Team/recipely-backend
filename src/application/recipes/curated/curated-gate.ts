/**
 * The quality gates a curated recipe must pass to be published, as far as
 * they can be checked from its file and its photo. The rest of the photo's
 * gates (no watermark, the right dish) are checked by eye.
 */
export const CuratedGate = {
  /** Every ingredient has an FDC id and a gram weight. */
  IngredientSourced: 'ingredient_sourced',
  /** kcal ≈ 4·protein + 4·(carbs − fiber) + 9·fat + 2·fiber, within 12% (FDC carbs include fiber). */
  Energy: 'energy',
  /** kcal inside the category's plausible band, unless a person reviewed it. */
  KcalBand: 'kcal_band',
  /** Every listed ingredient appears in the steps, in every language. */
  IngredientInSteps: 'ingredient_in_steps',
  /** The total time is prep + cook. */
  TotalTime: 'total_time',
  /** An author, a reusable licence and an https source. */
  ImageCredit: 'image_credit',
  /** The photo is a readable image with a short side of at least 1200 px. */
  Photo: 'photo',
  /** The text passes the content moderator. */
  Moderation: 'moderation',
} as const;

export type CuratedGateType = (typeof CuratedGate)[keyof typeof CuratedGate];

/** One gate a file failed, and why, in words for the import report. */
export interface CuratedGateHit {
  readonly gate: CuratedGateType;
  readonly detail: string;
}
