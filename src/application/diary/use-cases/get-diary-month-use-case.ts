import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { CalendarMonth } from '@domain/diary/calendar-month';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { goalsOrDefaults } from '@application/diary/goals-or-defaults';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { DiaryMonthDto } from '@application/diary/dtos/diary-month.dto';

export interface GetDiaryMonthInput {
  readonly userId: string;
  readonly month: string;
}

/** Per-day totals for a month's calendar view — only the days something was logged. */
export class GetDiaryMonthUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(input: GetDiaryMonthInput): Promise<Result<DiaryMonthDto, Failure>> {
    const month = CalendarMonth.parse(input.month);
    if (!month.ok) return month;

    const [days, goals] = await Promise.all([
      this.repo.summarizeMonth(input.userId, month.value),
      goalsOrDefaults(this.repo, input.userId),
    ]);
    if (!days.ok) return days;
    if (!goals.ok) return goals;

    return ok({
      month: month.value.toString(),
      days: days.value.map(({ date, nutrients, entryCount }) => {
        const { calories, protein, carbs, fat } = DiaryMapper.totals(nutrients);
        return { date: date.toString(), calories, protein, carbs, fat, entryCount };
      }),
      goals: DiaryMapper.goals(goals.value),
    });
  }
}
