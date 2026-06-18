import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { PagedRecipesDto } from '@application/recipes/dtos/recipe.dto';

export interface ListTrendingRecipesInput {
  readonly limit?: number;
  readonly locale?: string;
  readonly currentUserId?: string;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export class ListTrendingRecipesUseCase {
  constructor(private readonly repo: IRecipeRepository) {}

  async execute(input: ListTrendingRecipesInput): Promise<Result<PagedRecipesDto, Failure>> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const locale = input.locale ?? 'en';

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return fail(new ValidationFailure('errors.validation.page_size_invalid', 'limit'));
    }

    const result = await this.repo.list({
      page: 1,
      pageSize: limit,
      locale,
      sort: 'trending',
      ...(input.currentUserId !== undefined ? { currentUserId: input.currentUserId } : {}),
    });

    if (!result.ok) return result;

    return ok(RecipeMapper.toPagedDto(result.value, locale));
  }
}
