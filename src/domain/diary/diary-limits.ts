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
  ServingsMax: 20,
  EntryCaloriesMax: 20_000,
  EntryMacroMax: 2_000,
  WaterGlassesMax: 30,
  GoalCaloriesMin: 800,
  GoalCaloriesMax: 6_000,
  GoalMacroMax: 600,
  GoalWaterMin: 1,
  GoalWaterMax: 30,
  RecentDefault: 20,
  RecentMax: 50,
} as const;
