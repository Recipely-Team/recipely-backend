import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { IRecipeLikeRepository } from '@domain/likes/i-recipe-like-repository';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipePageResult, RecipeSocialData } from '@domain/recipes/recipe-query';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';

export class PrismaRecipeLikeRepository implements IRecipeLikeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.recipeLike.create({ data: { userId, recipeId } });
      return ok(undefined);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Already liked — treat as success (idempotent).
        if (err.code === 'P2002') return ok(undefined);
        // FK violation — recipe does not exist.
        if (err.code === 'P2003') return fail(new NotFoundFailure('errors.not_found.recipe'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async remove(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.recipeLike.deleteMany({ where: { userId, recipeId } });
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
        this.prisma.recipeLike.findMany({
          where: { userId, recipe: { deletedAt: null } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          include: {
            recipe: {
              include: {
                media: { orderBy: { position: 'asc' } },
                // The listing user is the social context for their own liked
                // list, so `likedByMe` is true for every row here — it is still
                // read from the rows rather than assumed, because a like
                // removed between the two queries would otherwise show a filled
                // heart on a recipe that is no longer liked.
                _count: { select: { likes: true } },
                likes: { where: { userId }, select: { userId: true } },
              },
            },
          },
        }),
        this.prisma.recipeLike.count({ where: { userId, recipe: { deletedAt: null } } }),
      ]);

      const items: Recipe[] = [];
      const socialByRecipeId = new Map<string, RecipeSocialData>();

      for (const like of rows) {
        const mapped = RecipeRowMapper.toDomain(like.recipe);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);

        const recipeRow = like.recipe as typeof like.recipe & {
          _count: { likes: number };
          likes: { userId: string }[];
        };
        socialByRecipeId.set(mapped.value.id, {
          likeCount: recipeRow._count.likes,
          likedByMe: recipeRow.likes.length > 0,
          commentCount: (like.recipe as unknown as { commentCount: number }).commentCount ?? 0,
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
