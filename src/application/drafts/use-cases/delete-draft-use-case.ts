import { type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';

export interface DeleteDraftInput {
  readonly id: string;
  readonly requesterId: string;
}

export class DeleteDraftUseCase {
  constructor(private readonly repo: IRecipeDraftRepository) {}

  async execute(input: DeleteDraftInput): Promise<Result<void, Failure>> {
    const found = await this.repo.getById(input.id);
    if (!found.ok) return found;

    if (found.value.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    return this.repo.delete(input.id);
  }
}
