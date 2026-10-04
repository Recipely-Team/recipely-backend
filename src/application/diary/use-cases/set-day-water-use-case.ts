import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { DiaryLimits } from '@domain/diary/diary-limits';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import type { DayWaterDto } from '@application/diary/dtos/day-water.dto';

export interface SetDayWaterInput {
  readonly userId: string;
  readonly date: string;
  readonly glasses: number;
}

/** Records how many glasses of water the user drank on a day (replaces, not adds). */
export class SetDayWaterUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(input: SetDayWaterInput): Promise<Result<DayWaterDto, Failure>> {
    const date = CalendarDate.parse(input.date);
    if (!date.ok) return date;
    if (!Number.isInteger(input.glasses) || input.glasses < 0 || input.glasses > DiaryLimits.WaterGlassesMax) {
      return fail(new ValidationFailure('errors.validation.water_invalid', 'glasses'));
    }

    const saved = await this.repo.setWater(input.userId, date.value, input.glasses);
    if (!saved.ok) return saved;
    return ok({ date: date.value.toString(), waterGlasses: input.glasses });
  }
}
