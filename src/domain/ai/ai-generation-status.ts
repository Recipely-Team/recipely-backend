/**
 * How an AI generation attempt ended.
 *
 * @remarks
 * - **Written down once.** It was a bare `'success' | 'failed'` union, so the
 *   two words were typed at every call site and the union could not be reached
 *   from any of them. Same shape as {@link ImportJobStatus} and
 *   {@link ModerationStatus}, and the same failure mode: `status` is a stored
 *   column, so a misspelling is not a type error at the write site — it is a
 *   row that no later `WHERE status = 'failed'` will ever count.
 * - **The values are the stored ones.** Renaming a member without a migration
 *   silently orphans every existing row.
 */
export const AIGenerationStatus = {
  /** The model answered and the recipe was produced. */
  Success: 'success',
  /** The attempt did not produce a recipe; `errorMessage` says why. */
  Failed: 'failed',
} as const;

export type AIGenerationStatus = (typeof AIGenerationStatus)[keyof typeof AIGenerationStatus];
