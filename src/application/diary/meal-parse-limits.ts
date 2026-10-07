/**
 * Every bound on the meal parse, in one place.
 *
 * @remarks
 * - **`dailyPerUser`** is the cost cap: each parse is one or two model calls.
 * - **`maxItems` / `maxGrams`** bound what a model answer may claim, so a
 *   garbled reply cannot put 40 kg of bread in someone's diary.
 */
export const MealParseLimits = {
  dailyPerUser: 20,
  maxTextChars: 500,
  maxItems: 12,
  maxLabelChars: 80,
  maxGrams: 2000,
} as const;
