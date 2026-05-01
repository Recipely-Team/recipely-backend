import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ICategoryRepository } from '@domain/categories/i-category-repository';
import type { CategoryQuery } from '@domain/categories/category-query';
import type { PageResult } from '@domain/recipes/recipe-query';
import type { Category } from '@domain/categories/category';
import type { PagedCategoriesDto } from '@application/categories/dtos/category.dto';
import { CategoryMapper } from '@application/categories/mappers/category.mapper';

export interface ListCategoriesInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly locale?: string;
}

export class ListCategoriesUseCase {
  constructor(private readonly categoryRepository: ICategoryRepository) {}

  async execute(input: ListCategoriesInput): Promise<Result<PagedCategoriesDto, Failure>> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const locale = input.locale ?? 'en';

    const query: CategoryQuery = { page, pageSize };
    const result = await this.categoryRepository.list(query);

    if (!result.ok) return result;

    return {
      ok: true,
      value: CategoryMapper.toPagedDto(result.value, locale),
    };
  }
}