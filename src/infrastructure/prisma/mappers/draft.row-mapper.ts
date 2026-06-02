import type { RecipeDraft as RecipeDraftRow } from '@prisma/client';
import { isFail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { DraftRecipeSnapshot, ChatMessage } from '@domain/drafts/recipe-draft';
import { logger } from '@presentation/server/logger';

export class DraftRowMapper {
  static toDomain(row: RecipeDraftRow): Result<RecipeDraft, Failure> {
    const snapshot = row.snapshot as unknown as DraftRecipeSnapshot;
    const chatHistory = row.chatHistory as unknown as ChatMessage[];

    const result = RecipeDraft.create({
      id: row.id,
      ownerId: row.ownerId,
      prompt: row.prompt,
      snapshot,
      chatHistory,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });

    if (isFail(result)) {
      logger.error({ rowId: row.id, validationFailure: result.failure }, 'DraftRowMapper: domain entity creation failed on DB row');
      return { ok: false, failure: new UnknownFailure(`Corrupt draft row ${row.id}`) };
    }
    return result;
  }
}
