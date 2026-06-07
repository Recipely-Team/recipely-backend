import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { ICommentLikeRepository } from '@domain/likes/i-comment-like-repository';

export class PrismaCommentLikeRepository implements ICommentLikeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async add(userId: string, commentId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.commentLike.create({ data: { userId, commentId } });
      return ok(undefined);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Already liked — treat as success (idempotent).
        if (err.code === 'P2002') return ok(undefined);
        // FK violation — comment does not exist.
        if (err.code === 'P2003') return fail(new NotFoundFailure('errors.not_found.comment'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async remove(userId: string, commentId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.commentLike.deleteMany({ where: { userId, commentId } });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
