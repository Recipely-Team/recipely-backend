import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { PagedRecipesDto } from '@application/recipes/dtos/recipe.dto';

export interface ListRecipesInput {
  readonly search?: string;
  readonly categoryId?: string;
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
    const result = await this.repo.list({
      page,
      pageSize,
      ...(search ? { search } : {}),
      ...(categoryId ? { categoryId } : {}),
    });

    if (!result.ok) return result;
    return ok(RecipeMapper.toPagedDto(result.value, locale));
  }
}