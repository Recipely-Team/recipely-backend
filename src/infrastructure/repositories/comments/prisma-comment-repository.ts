import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Comment } from '@domain/comments/comment';
import type { ICommentRepository, CommentPageResult } from '@domain/comments/i-comment-repository';
import { CommentRowMapper } from '@infrastructure/prisma/mappers/comment.row-mapper';

export class PrismaCommentRepository implements ICommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(comment: Comment): Promise<Result<Comment, Failure>> {
    try {
      const raw = comment.toRaw();
      const row = await this.prisma.comment.create({
        data: {
          id: comment.id,
          body: raw.body,
          moderationStatus: raw.moderationStatus,
          recipeId: raw.recipeId,
          authorId: raw.authorId,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        },
      });
      return CommentRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getById(id: string): Promise<Result<Comment, Failure>> {
    try {
      const row = await this.prisma.comment.findFirst({
        where: { id, deletedAt: null },
      });
      if (!row) return fail(new NotFoundFailure('errors.not_found.comment'));
      return CommentRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listByRecipe(recipeId: string, page: number, pageSize: number): Promise<Result<CommentPageResult, Failure>> {
    const where = { recipeId, moderationStatus: 'approved', deletedAt: null };
    const skip = (page - 1) * pageSize;

    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.comment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        this.prisma.comment.count({ where }),
      ]);

      const items: Comment[] = [];
      for (const row of rows) {
        const mapped = CommentRowMapper.toDomain(row);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);
      }

      return ok({ items, total, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async softDelete(id: string): Promise<Result<void, Failure>> {
    try {
      const result = await this.prisma.comment.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) return fail(new NotFoundFailure('errors.not_found.comment'));
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
