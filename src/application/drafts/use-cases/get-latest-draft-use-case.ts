import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import { DraftMapper } from '@application/drafts/mappers/draft.mapper';
import type { RecipeDraftDto } from '@application/drafts/dtos/draft.dto';

export interface GetLatestDraftInput {
  readonly ownerId: string;
}

export class GetLatestDraftUseCase {
  constructor(private readonly repo: IRecipeDraftRepository) {}

  async execute(input: GetLatestDraftInput): Promise<Result<RecipeDraftDto, Failure>> {
    const result = await this.repo.getLatestByOwner(input.ownerId);
    if (!result.ok) return result;
    return ok(DraftMapper.toDto(result.value));
  }
}
