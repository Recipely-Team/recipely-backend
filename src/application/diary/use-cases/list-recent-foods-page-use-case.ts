import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { RecentFoodDto } from '@application/diary/dtos/recent-food.dto';

export interface ListRecentFoodsPageInput {
  readonly userId: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * **`GET /diary/foods/recent`** — the foods the user logged before, one per
 * distinct food, newest first, paged; each sized to ONE serving (or one unit
 * of a product) so it can be logged again at any quantity. The paged
 * successor of `GET /diary/recent`.
 */
export class ListRecentFoodsPageUseCase {
  constructor(private readonly repo: FoodDiaryRepositoryInterface) {}

  async execute(input: ListRecentFoodsPageInput): Promise<Result<PageResult<RecentFoodDto>, Failure>> {
    const found = await this.repo.listRecentPage(input.userId, input.page, input.pageSize);
    return mapResult(found, (page) => ({ ...page, items: page.items.map(DiaryMapper.recent) }));
  }
}
