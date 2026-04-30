import { ok, fail, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { Category } from '@domain/categories/category';

type CategoryRow = {
  id: string;
  slug: string;
  name: unknown;
  cuisine: unknown;
  createdAt: Date;
};

export class CategoryRowMapper {
  static toDomain(row: CategoryRow): Result<Category, Failure> {
    const result = Category.create({
      id: row.id,
      slug: row.slug,
      name: row.name as unknown as Record<string, string>,
      cuisine: row.cuisine as unknown as Record<string, string>,
      createdAt: row.createdAt,
    });
    return result;
  }
}