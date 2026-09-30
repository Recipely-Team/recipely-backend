import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { RecentFoodDto } from '@application/diary/dtos/recent-food.dto';

export interface ListRecentFoodsInput {
  readonly userId: string;
  readonly limit: number;
}

/**
 * Foods the user logged before, one per distinct food, newest first — each
 * sized to ONE serving so the client can log it again at any portion.
 */
export class ListRecentFoodsUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(input: ListRecentFoodsInput): Promise<Result<RecentFoodDto[], Failure>> {
    const recent = await this.repo.listRecent(input.userId, input.limit);
    return mapResult(recent, (records) => records.map(DiaryMapper.recent));
  }
}
