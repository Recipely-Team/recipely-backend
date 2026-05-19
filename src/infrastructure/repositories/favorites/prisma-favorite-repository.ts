import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { IFavoriteRepository } from '@domain/favorites/i-favorite-repository';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult, RecipeSocialData } from '@domain/recipes/recipe-query';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';

export class PrismaFavoriteRepository implements IFavoriteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    try {
      // Idempotent: P2002 (already exists) is treated as success.
      await this.prisma.favorite.create({
        data: { userId, recipeId },
      });
      return ok(undefined);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') return ok(undefined);
        if (err.code === 'P2003') return fail(new NotFoundFailure('errors.not_found.recipe'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async remove(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.favorite.deleteMany({
        where: { userId, recipeId },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listForUser(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<Result<RecipePageResult, Failure>> {
    const skip = (page - 1) * pageSize;
    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.favorite.findMany({
          where: { userId, recipe: { deletedAt: null } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          include: {
            recipe: {
              include: {
                media: { orderBy: { position: 'asc' } },
                // Always enrich with like data; the listing user is always the
                // social context for the favorites screen.
                _count: { select: { likes: true } },
                likes: { where: { userId }, select: { userId: true } },
              },
            },
          },
        }),
        this.prisma.favorite.count({ where: { userId, recipe: { deletedAt: null } } }),
      ]);

      const items: Recipe[] = [];
      const socialByRecipeId = new Map<string, RecipeSocialData>();

      for (const fav of rows) {
        const mapped = RecipeRowMapper.toDomain(fav.recipe);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);

        const recipeRow = fav.recipe as typeof fav.recipe & {
          _count: { likes: number };
          likes: { userId: string }[];
        };
        socialByRecipeId.set(mapped.value.id, {
          likeCount: recipeRow._count.likes,
          likedByMe: recipeRow.likes.length > 0,
          commentCount: (fav.recipe as unknown as { commentCount: number }).commentCount ?? 0,
        });
      }

      return ok({ items, total, page, pageSize, socialByRecipeId });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
