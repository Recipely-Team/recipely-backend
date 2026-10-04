import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { goalsOrDefaults } from '@application/diary/goals-or-defaults';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { NutritionGoalsDto } from '@application/diary/dtos/nutrition-goals.dto';

/** The user's daily goals — the defaults until they save their own. */
export class GetNutritionGoalsUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(userId: string): Promise<Result<NutritionGoalsDto, Failure>> {
    return mapResult(await goalsOrDefaults(this.repo, userId), DiaryMapper.goals);
  }
}
