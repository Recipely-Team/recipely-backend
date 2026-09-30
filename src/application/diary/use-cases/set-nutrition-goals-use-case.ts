import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { NutritionGoals, type NutritionGoalValues } from '@domain/diary/nutrition-goals';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { NutritionGoalsDto } from '@application/diary/dtos/nutrition-goals.dto';

export interface SetNutritionGoalsInput {
  readonly userId: string;
  readonly goals: NutritionGoalValues;
}

/** Replaces the user's daily goals with a full, bounds-checked set. */
export class SetNutritionGoalsUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(input: SetNutritionGoalsInput): Promise<Result<NutritionGoalsDto, Failure>> {
    const goals = NutritionGoals.create(input.goals);
    if (!goals.ok) return goals;
    return mapResult(await this.repo.saveGoals(input.userId, goals.value), DiaryMapper.goals);
  }
}
