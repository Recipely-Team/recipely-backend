import type { FoodLogEntryDto } from '@application/diary/dtos/food-log-entry.dto';
import type { NutrientTotalsDto } from '@application/diary/dtos/nutrient-totals.dto';
import type { NutritionGoalsDto } from '@application/diary/dtos/nutrition-goals.dto';

export interface DiaryDayDto {
  readonly date: string;
  readonly entries: FoodLogEntryDto[];
  readonly waterGlasses: number;
  readonly totals: NutrientTotalsDto;
  readonly goals: NutritionGoalsDto;
}
