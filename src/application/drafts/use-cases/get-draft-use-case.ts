import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import { DraftMapper } from '@application/drafts/mappers/draft.mapper';
import type { RecipeDraftDto } from '@application/drafts/dtos/draft.dto';

export interface GetDraftInput {
  readonly id: string;
  readonly requesterId: string;
}

export class GetDraftUseCase {
  constructor(private readonly repo: RecipeDraftRepositoryInterface) {}

  async execute(input: GetDraftInput): Promise<Result<RecipeDraftDto, Failure>> {
    const found = await this.repo.getById(input.id);
    if (!found.ok) return found;

    if (found.value.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    return ok(DraftMapper.toDto(found.value));
  }
}
