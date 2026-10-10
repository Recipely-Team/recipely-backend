import type { Difficulty } from '@domain/recipes/difficulty';

/** One dish idea from the fridge. */
export interface FridgeIdeaDto {
  readonly title: string;
  /** At most 140 characters. */
  readonly summary: string;
  readonly totalMinutes: number;
  readonly difficulty: Difficulty;
  /** Taken from the ingredients the request sent, as it spelled them. */
  readonly uses: readonly string[];
  /** At most 5 things to buy; never a pantry staple (salt, pepper, oil, water). */
  readonly missing: readonly string[];
}
