/**
 * The bounds every meal-plan value is held to, named once so the request
 * validators and the domain factories cannot drift apart.
 *
 * @remarks
 * - **`EntriesPerDayMax`** is plausibility: four meals with three dishes each.
 *   It also bounds a range read (14 days × 12 rows).
 * - **`RangeDaysMax`** caps every range read and clear — two weeks, the
 *   planner's widest view.
 * - **`CopyDays`** is a week: a copy moves seven days onto seven days.
 */
export const MealPlanLimits = {
  EntriesPerDayMax: 12,
  RangeDaysMax: 14,
  CopyDays: 7,
  PositionMax: 999,
} as const;
