import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { PageResult, RecipeQuery } from '@domain/recipes/recipe-query';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';

export class PrismaRecipeRepository implements IRecipeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: RecipeQuery): Promise<Result<PageResult<Recipe>, Failure>> {
    const where: Prisma.RecipeWhereInput = { isPublished: true };
    if (query.categoryId) where.categoryId = query.categoryId;
    // Note: JSON search requires Prisma's JSON filtering which is limited.
    // Full-text search across localized content is better handled at application
    // level by fetching and filtering in-memory, or via raw SQL with JSON operators.
    // For now, we omit search on JSON columns and rely on the DB-level index.
    void query.search; // mark as intentionally unused until JSON search is implemented

    const skip = (query.page - 1) * query.pageSize;

    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.recipe.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.pageSize,
          include: { media: { orderBy: { position: 'asc' } } },
        }),
        this.prisma.recipe.count({ where }),
      ]);

      const items: Recipe[] = [];
      for (const row of rows) {
        const mapped = RecipeRowMapper.toDomain(row);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);
      }

      return ok({ items, total, page: query.page, pageSize: query.pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getById(id: string): Promise<Result<Recipe, Failure>> {
    try {
      const row = await this.prisma.recipe.findUnique({
        where: { id },
        include: { media: { orderBy: { position: 'asc' } } },
      });
      if (!row) return fail(new NotFoundFailure('errors.not_found.recipe'));
      return RecipeRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async create(recipe: Recipe): Promise<Result<Recipe, Failure>> {
    try {
      const raw = recipe.toRaw();
      const row = await this.prisma.recipe.create({
        data: {
          id: recipe.id,
          name: raw.name as unknown as Prisma.InputJsonValue,
          cuisine: raw.cuisine as unknown as Prisma.InputJsonValue,
          difficulty: raw.difficulty,
          ingredients: raw.ingredients as unknown as Prisma.InputJsonValue,
          instructions: raw.instructions as unknown as Prisma.InputJsonValue,
          prepTimeMinutes: raw.prepTimeMinutes,
          cookTimeMinutes: raw.cookTimeMinutes,
          servings: raw.servings,
          caloriesPerServing: raw.caloriesPerServing,
          image: raw.image,
          rating: raw.rating,
          tags: raw.tags as unknown as Prisma.InputJsonValue,
          mealType: raw.mealType as unknown as Prisma.InputJsonValue,
          isPublished: raw.isPublished,
          ownerId: raw.ownerId,
          ...(raw.categoryId !== null ? { categoryId: raw.categoryId } : {}),
          ...(raw.media.length > 0
            ? {
                media: {
                  create: raw.media.map(m => ({
                    id: m.id,
                    type: m.type,
                    url: m.url,
                    position: m.position,
                  })),
                },
              }
            : {}),
        },
        include: { media: { orderBy: { position: 'asc' } } },
      });
      return RecipeRowMapper.toDomain(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          return fail(new ConflictFailure('errors.conflict.recipe_exists'));
        }
        if (err.code === 'P2003') {
          return fail(new NotFoundFailure('errors.not_found.category'));
        }
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}