import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { IRecipeLikeRepository } from '@domain/likes/i-recipe-like-repository';

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
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
