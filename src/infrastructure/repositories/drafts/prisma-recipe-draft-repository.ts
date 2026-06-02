import type { PrismaClient, Prisma } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import type { PageResult } from '@domain/common/page-result';
import { DraftRowMapper } from '@infrastructure/prisma/mappers/draft.row-mapper';

export class PrismaRecipeDraftRepository implements IRecipeDraftRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(draft: RecipeDraft): Promise<Result<RecipeDraft, Failure>> {
    try {
      const raw = draft.toRaw();
      const row = await this.prisma.recipeDraft.upsert({
        where: { id: raw.id },
        update: {
          prompt: raw.prompt,
          snapshot: raw.snapshot as unknown as Prisma.InputJsonValue,
          chatHistory: raw.chatHistory as unknown as Prisma.InputJsonValue,
        },
        create: {
          id: raw.id,
          ownerId: raw.ownerId,
          prompt: raw.prompt,
          snapshot: raw.snapshot as unknown as Prisma.InputJsonValue,
          chatHistory: raw.chatHistory as unknown as Prisma.InputJsonValue,
        },
      });
      return DraftRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getById(id: string): Promise<Result<RecipeDraft, Failure>> {
    try {
      const row = await this.prisma.recipeDraft.findFirst({ where: { id } });
      if (!row) return fail(new NotFoundFailure('errors.not_found.draft'));
      return DraftRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listByOwner(ownerId: string, page: number, pageSize: number): Promise<Result<PageResult<RecipeDraft>, Failure>> {
    const where = { ownerId };
    const skip = (page - 1) * pageSize;

    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.recipeDraft.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip,
          take: pageSize,
        }),
        this.prisma.recipeDraft.count({ where }),
      ]);

      const items: RecipeDraft[] = [];
      for (const row of rows) {
        const mapped = DraftRowMapper.toDomain(row);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);
      }

      return ok({ items, total, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getLatestByOwner(ownerId: string): Promise<Result<RecipeDraft, Failure>> {
    try {
      const row = await this.prisma.recipeDraft.findFirst({
        where: { ownerId },
        orderBy: { updatedAt: 'desc' },
      });
      if (!row) return fail(new NotFoundFailure('errors.not_found.draft'));
      return DraftRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async delete(id: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.recipeDraft.deleteMany({ where: { id } });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
