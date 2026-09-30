import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import type { MealSlotType } from '@domain/diary/meal-slot';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { FoodLogEntryDto } from '@application/diary/dtos/food-log-entry.dto';

export interface UpdateFoodLogEntryInput {
  readonly id: string;
  readonly userId: string;
  readonly meal?: MealSlotType;
  readonly servings?: number;
  readonly date?: string;
}

/**
 * Moves an entry to another meal or day, or changes its servings — which
 * rescales its stored totals proportionally. Someone else's entry is `not_found`.
 */
export class UpdateFoodLogEntryUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(input: UpdateFoodLogEntryInput): Promise<Result<FoodLogEntryDto, Failure>> {
    let date: CalendarDate | undefined;
    if (input.date !== undefined) {
      const parsed = CalendarDate.parse(input.date);
      if (!parsed.ok) return parsed;
      date = parsed.value;
    }

    const found = await this.repo.findEntry(input.id, input.userId);
    if (!found.ok) return found;

    const changed = found.value.entry.apply(
      {
        ...(input.meal !== undefined ? { meal: input.meal } : {}),
        ...(input.servings !== undefined ? { servings: input.servings } : {}),
        ...(date !== undefined ? { date } : {}),
      },
      new Date(),
    );
    if (!changed.ok) return changed;

    return mapResult(await this.repo.updateEntry(changed.value), DiaryMapper.entry);
  }
}
