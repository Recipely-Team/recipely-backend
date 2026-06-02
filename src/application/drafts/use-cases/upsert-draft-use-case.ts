import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { DraftRecipeSnapshot, ChatMessage } from '@domain/drafts/recipe-draft';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import { DraftMapper } from '@application/drafts/mappers/draft.mapper';
import type { RecipeDraftDto } from '@application/drafts/dtos/draft.dto';

export interface UpsertDraftInput {
  readonly id: string;
  readonly ownerId: string;
  readonly prompt: string;
  readonly snapshot: DraftRecipeSnapshot;
  readonly chatHistory: ChatMessage[];
}

export class UpsertDraftUseCase {
  constructor(private readonly repo: IRecipeDraftRepository) {}

  async execute(input: UpsertDraftInput): Promise<Result<RecipeDraftDto, Failure>> {
    // Ownership check: if a draft already exists under this id, only the owner
    // may overwrite it. A not_found response means this is a new draft — proceed.
    // Any other failure (e.g. UnknownFailure from DB) is propagated unchanged.
    const existing = await this.repo.getById(input.id);
    if (existing.ok) {
      if (existing.value.ownerId !== input.ownerId) {
        return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
      }
    } else if (existing.failure.code !== 'not_found') {
      return existing;
    }

    const now = new Date();
    const draftResult = RecipeDraft.create({
      id: input.id,
      ownerId: input.ownerId,
      prompt: input.prompt,
      snapshot: input.snapshot,
      chatHistory: input.chatHistory,
      createdAt: now,
      updatedAt: now,
    });
    if (!draftResult.ok) return draftResult;

    const saved = await this.repo.upsert(draftResult.value);
    if (!saved.ok) return saved;

    return ok(DraftMapper.toDto(saved.value));
  }
}
