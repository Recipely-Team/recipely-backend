import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipeQuery, RecipeSort } from '@domain/recipes/recipe-query';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { PagedRecipesDto } from '@application/recipes/dtos/recipe.dto';

export interface ListRecipesInput {
  readonly search?: string;
  readonly categoryId?: string;
  readonly ownerId?: string;
  readonly includeUnpublished?: boolean;
  readonly cuisines?: string[];
  readonly difficulties?: Difficulty[];
  readonly maxTime?: number;
  readonly sort?: RecipeSort;
  readonly page?: number;
  readonly pageSize?: number;
  readonly locale?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class ListRecipesUseCase {
  constructor(private readonly repo: IRecipeRepository) {}

  async execute(input: ListRecipesInput): Promise<Result<PagedRecipesDto, Failure>> {
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const locale = input.locale ?? 'en';

    if (!Number.isInteger(page) || page < 1) {
      return fail(new ValidationFailure('errors.validation.page_invalid', 'page'));
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      return fail(
        new ValidationFailure('errors.validation.page_size_invalid', 'pageSize'),
      );
    }

    const search = input.search?.trim();
    const categoryId = input.categoryId?.trim();
    const ownerId = input.ownerId?.trim();
    const query: RecipeQuery = {
      page,
      pageSize,
      locale,
      ...(search ? { search } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(input.includeUnpublished ? { includeUnpublished: true } : {}),
      ...(input.cuisines && input.cuisines.length > 0 ? { cuisines: input.cuisines } : {}),
      ...(input.difficulties && input.difficulties.length > 0
        ? { difficulties: input.difficulties }
        : {}),
      ...(input.maxTime !== undefined ? { maxTime: input.maxTime } : {}),
      ...(input.sort !== undefined ? { sort: input.sort } : {}),
    };
    const result = await this.repo.list(query);

    if (!result.ok) return result;
    return ok(RecipeMapper.toPagedDto(result.value, locale));
  }
}
