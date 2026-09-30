import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { Nutrients } from '@domain/diary/nutrients';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { goalsOrDefaults } from '@application/diary/goals-or-defaults';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { DiaryDayDto } from '@application/diary/dtos/diary-day.dto';

export interface GetDiaryDayInput {
  readonly userId: string;
  readonly date: string;
}

/** One day of the diary: entries, water, totals and the goals they are measured against. */
export class GetDiaryDayUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(input: GetDiaryDayInput): Promise<Result<DiaryDayDto, Failure>> {
    const date = CalendarDate.parse(input.date);
    if (!date.ok) return date;

    const [day, goals] = await Promise.all([
      this.repo.getDay(input.userId, date.value),
      goalsOrDefaults(this.repo, input.userId),
    ]);
    if (!day.ok) return day;
    if (!goals.ok) return goals;

    const totals = day.value.entries.reduce((sum, record) => sum.plus(record.entry.nutrients), Nutrients.zero());
    return ok({
      date: date.value.toString(),
      entries: day.value.entries.map(DiaryMapper.entry),
      waterGlasses: day.value.waterGlasses,
      totals: DiaryMapper.totals(totals),
      goals: DiaryMapper.goals(goals.value),
    });
  }
}
