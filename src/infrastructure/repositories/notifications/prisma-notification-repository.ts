import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { NotificationRepositoryInterface, NotificationItem } from '@application/notifications/ports/notification-repository-interface';
import { visibleCommentId } from '@infrastructure/repositories/notifications/visible-comment-id';

export class PrismaNotificationRepository implements NotificationRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    recipientId: string;
    type: string;
    senderId?: string;
    recipeId?: string;
    commentId?: string;
    draftId?: string;
    message?: string;
  }): Promise<Result<void, Failure>> {
    try {
      await this.prisma.notification.create({
        data: {
          recipientId: input.recipientId,
          type: input.type,
          ...(input.senderId !== undefined ? { senderId: input.senderId } : {}),
          ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
          ...(input.commentId !== undefined ? { commentId: input.commentId } : {}),
          ...(input.draftId !== undefined ? { draftId: input.draftId } : {}),
          ...(input.message !== undefined ? { message: input.message } : {}),
        },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async exists(input: {
    recipientId: string;
    type: string;
    senderId?: string;
    recipeId?: string;
    commentId?: string;
  }): Promise<Result<boolean, Failure>> {
    try {
      const count = await this.prisma.notification.count({
        where: {
          recipientId: input.recipientId,
          type: input.type,
          // Match NULL columns explicitly so a like (which has both sender and
          // recipe) never collides with a follow (which has neither). commentId
          // is matched for the same reason: nothing dedupes on it today, but
          // without it a future "X liked your comment" notification using
          // `dedupe` would treat every comment by the same sender on the same
          // recipe as the same notification and swallow all but the first.
          senderId: input.senderId ?? null,
          recipeId: input.recipeId ?? null,
          commentId: input.commentId ?? null,
          deletedAt: null,
        },
      });
      return ok(count > 0);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listForUser(
    recipientId: string,
    limit: number,
    offset: number,
  ): Promise<Result<{ items: NotificationItem[]; total: number }, Failure>> {
    const where = { recipientId, deletedAt: null };

    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            sender: { select: { displayName: true, photoUrl: true } },
            recipe: { select: { name: true } },
            comment: { select: { deletedAt: true, moderationStatus: true } },
          },
        }),
        this.prisma.notification.count({ where }),
      ]);

      const items: NotificationItem[] = rows.map(row => {
        // Recipe name is a JSON object keyed by locale — extract English or first available.
        const nameJson = row.recipe?.name as Record<string, string> | null | undefined;
        const recipeTitle = nameJson != null
          ? (nameJson['en'] ?? Object.values(nameJson)[0] ?? null)
          : null;

        return {
          id: row.id,
          type: row.type,
          senderId: row.senderId,
          senderDisplayName: row.sender?.displayName ?? null,
          senderPhotoUrl: row.sender?.photoUrl ?? null,
          recipeId: row.recipeId,
          recipeTitle: recipeTitle ?? null,
          commentId: visibleCommentId(row.commentId, row.comment),
          draftId: row.draftId,
          message: row.message ?? null,
          read: row.read,
          createdAt: row.createdAt,
        };
      });

      return ok({ items, total });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async countUnread(recipientId: string): Promise<Result<number, Failure>> {
    try {
      const count = await this.prisma.notification.count({
        where: { recipientId, read: false, deletedAt: null },
      });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async markAllRead(recipientId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.notification.updateMany({
        where: { recipientId, read: false, deletedAt: null },
        data: { read: true },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async markRead(id: string, recipientId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.notification.updateMany({
        where: { id, recipientId, deletedAt: null },
        data: { read: true },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async softDeleteByCommentId(commentId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.notification.updateMany({
        where: { commentId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async repointDraftToRecipe(draftId: string, recipeId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.notification.updateMany({
        where: { draftId, deletedAt: null },
        data: { recipeId, draftId: null },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
