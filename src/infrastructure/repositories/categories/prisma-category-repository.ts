import { type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Category } from '@domain/categories/category';
import type { ICategoryRepository } from '@domain/categories/i-category-repository';
import type { CategoryQuery } from '@domain/categories/category-query';
import type { PageResult } from '@domain/recipes/recipe-query';
import { CategoryRowMapper } from '@infrastructure/prisma/mappers/category.row-mapper';

export class PrismaCategoryRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: CategoryQuery): Promise<Result<PageResult<Category>, Failure>> {
    const skip = (query.page - 1) * query.pageSize;

    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.category.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.pageSize,
        }),
        this.prisma.category.count(),
      ]);

      const items: Category[] = [];
      for (const row of rows) {
        const mapped = CategoryRowMapper.toDomain(row);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);
      }

      return ok({ items, total, page: query.page, pageSize: query.pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getById(id: string): Promise<Result<Category, Failure>> {
    try {
      const row = await this.prisma.category.findUnique({ where: { id } });
      if (!row) return fail(new NotFoundFailure('errors.not_found.category'));
      return CategoryRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}