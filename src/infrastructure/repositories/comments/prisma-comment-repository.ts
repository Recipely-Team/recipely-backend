import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Comment } from '@domain/comments/comment';
import type { CommentWithAuthor, ICommentRepository, CommentPageResult } from '@domain/comments/i-comment-repository';
import { CommentRowMapper } from '@infrastructure/prisma/mappers/comment.row-mapper';

export class PrismaCommentRepository implements ICommentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(comment: Comment): Promise<Result<Comment, Failure>> {
    try {
      const raw = comment.toRaw();
      const isApproved = raw.moderationStatus === 'approved';

      if (isApproved) {
        // Atomically insert the comment and increment the recipe's comment_count
        // in a single round-trip so the denormalized counter stays consistent.
        const [row] = await this.prisma.$transaction([
          this.prisma.comment.create({
            data: {
              id: comment.id,
              body: raw.body,
              moderationStatus: raw.moderationStatus,
              recipeId: raw.recipeId,
              authorId: raw.authorId,
              createdAt: raw.createdAt,
              updatedAt: raw.updatedAt,
            },
          }),
          this.prisma.recipe.update({
            where: { id: raw.recipeId },
            data: { commentCount: { increment: 1 } },
          }),
        ]);
        return CommentRowMapper.toDomain(row);
      }

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
          include: {
            author: {
              select: { displayName: true, photoUrl: true },
            },
          },
        }),
        this.prisma.comment.count({ where }),
      ]);

      const items: CommentWithAuthor[] = [];
      for (const row of rows) {
        const mapped = CommentRowMapper.toDomain(row);
        if (!mapped.ok) return mapped;
        items.push({
          comment: mapped.value,
          authorDisplayName: row.author.displayName,
          authorPhotoUrl: row.author.photoUrl,
        });
      }

      return ok({ items, total, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async softDelete(id: string): Promise<Result<void, Failure>> {
    try {
      // Read the comment first to check if it was approved — if so, decrement
      // the recipe's comment_count atomically in the same transaction.
      const existing = await this.prisma.comment.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, moderationStatus: true, recipeId: true },
      });
      if (!existing) return fail(new NotFoundFailure('errors.not_found.comment'));

      const wasApproved = existing.moderationStatus === 'approved';

      if (wasApproved) {
        await this.prisma.$transaction([
          this.prisma.comment.update({
            where: { id },
            data: { deletedAt: new Date() },
          }),
          this.prisma.recipe.update({
            where: { id: existing.recipeId },
            data: { commentCount: { decrement: 1 } },
          }),
        ]);
      } else {
        await this.prisma.comment.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
      }

      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
