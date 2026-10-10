import type { MealParseNoteType } from '@application/diary/meal-parse-note';
import type { MealParseItemDto } from '@application/diary/dtos/meal-parse-item.dto';

/** `POST /diary/meal-parse` — candidates for the user to confirm; nothing is logged. */
export interface MealParseDto {
  readonly items: readonly MealParseItemDto[];
  readonly note?: MealParseNoteType;
}
