/** `POST /me/meal-plan/copy`: how many rows landed, and how many a full day turned away. */
export interface CopyMealPlanResultDto {
  readonly copied: number;
  readonly skipped: number;
}
