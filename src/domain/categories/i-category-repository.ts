import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { Category } from '@domain/categories/category';
import type { CategoryQuery } from '@domain/categories/category-query';
import type { PageResult } from '@domain/recipes/recipe-query';

export interface ICategoryRepository {
  list(query: CategoryQuery): Promise<Result<PageResult<Category>, Failure>>;
  getById(id: string): Promise<Result<Category, Failure>>;
}