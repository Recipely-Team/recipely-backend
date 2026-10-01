/**
 * The bounds every food-diary value is held to, named once so the request
 * validators and the domain factories cannot drift apart.
 *
 * @remarks
 * - **Entry caps are plausibility, not nutrition advice.** They exist to keep a
 *   mistyped extra zero out of a month's totals, so they sit well past any real
 *   plate.
 * - **Goal caps are the ranges the settings screen offers.**
 */
export const DiaryLimits = {
  NameMaxLength: 120,
  ServingsMin: 0.5,
  ServingsStep: 0.5,
  ServingsMax: 20,
  EntryCaloriesMax: 20_000,
  EntryMacroMax: 2_000,
  WaterGlassesMax: 12,
  GoalCaloriesMin: 500,
  GoalCaloriesMax: 6_000,
  GoalMacroMax: 600,
  GoalWaterMin: 1,
  GoalWaterMax: 12,
  RecentDefault: 20,
  RecentMax: 50,
  /**
   * A product entry's quantity of its unit: ½ steps like servings, but up to
   * this many — 150 g is 150 units of 'g'. A mistyped zero, not a meal, goes past it.
   */
  ProductQuantityMax: 5_000,
  /** Base g/ml in one serving unit (a 1.5 l bottle is the biggest plausible one). */
  ProductUnitAmountMax: 2_000,
} as const;
