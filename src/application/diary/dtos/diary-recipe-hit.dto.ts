import type { ModerationStatus } from '@domain/moderation/moderation-status';

/** One recipe row of the diary food search — what logging it needs, per serving. */
export interface DiaryRecipeHitDto {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly servings: number;
  /** kcal per serving, 0 when unknown. */
  readonly caloriesPerServing: number;
  /** Grams per serving; `null` when unknown. */
  readonly protein: number | null;
  readonly carbs: number | null;
  readonly fat: number | null;
  readonly fiber: number | null;
  /** Estimated cooked weight of one serving, when known. */
  readonly servingWeightGrams: number | null;
  /** The recipe's moderation status — `unreviewed` (private), `pending`, `approved` or `rejected`. */
  readonly status: ModerationStatus;
  readonly isPublished: boolean;
}
