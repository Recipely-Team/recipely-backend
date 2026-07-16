import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { INotificationRepository, NotificationItem } from '@application/notifications/ports/i-notification-repository';

export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    recipientId: string;
    type: string;
    senderId?: string;
    recipeId?: string;
    commentId?: string;
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
  }): Promise<Result<boolean, Failure>> {
    try {
      const count = await this.prisma.notification.count({
        where: {
          recipientId: input.recipientId,
          type: input.type,
          // Match NULL columns explicitly so a like (which has both sender and
          // recipe) never collides with a follow (which has neither).
          senderId: input.senderId ?? null,
          recipeId: input.recipeId ?? null,
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
    const where = { recipientId };

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

        // Only advertise a comment the reader can actually see. Comments are
        // soft-deleted, so the FK's SET NULL never fires for them, and an
        // unapproved comment is filtered out of the recipe's comment list —
        // either way the app would deep-link to a comment it never renders.
        const commentVisible =
          row.comment != null &&
          row.comment.deletedAt === null &&
          row.comment.moderationStatus === 'approved';

        return {
          id: row.id,
          type: row.type,
          senderId: row.senderId,
          senderDisplayName: row.sender?.displayName ?? null,
          senderPhotoUrl: row.sender?.photoUrl ?? null,
          recipeId: row.recipeId,
          recipeTitle: recipeTitle ?? null,
          commentId: commentVisible ? row.commentId : null,
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
        where: { recipientId, read: false },
      });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async markAllRead(recipientId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.notification.updateMany({
        where: { recipientId, read: false },
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
        where: { id, recipientId },
        data: { read: true },
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
