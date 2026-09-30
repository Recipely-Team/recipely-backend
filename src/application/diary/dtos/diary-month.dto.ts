import type { NutritionGoalsDto } from '@application/diary/dtos/nutrition-goals.dto';

export interface DiaryMonthDto {
  readonly month: string;
  readonly days: {
    readonly date: string;
    readonly calories: number;
    readonly protein: number;
    readonly carbs: number;
    readonly fat: number;
    readonly entryCount: number;
  }[];
  readonly goals: NutritionGoalsDto;
}
