import type { MealMatchKindType } from '@domain/diary/meal-match-kind';
import type { NutrientsPerPortionDto } from '@application/diary/dtos/nutrients-per-portion.dto';

/** One candidate diary item from a meal parse. */
export interface MealParseItemDto {
  readonly label: string;
  readonly grams: number;
  readonly match: { readonly kind: MealMatchKindType; readonly id?: string; readonly name?: string };
  readonly nutrientsPerPortion: NutrientsPerPortionDto;
  /** True when the nutrients are the model's estimate rather than our catalogue's. */
  readonly estimated: boolean;
  readonly confidence: number;
}
