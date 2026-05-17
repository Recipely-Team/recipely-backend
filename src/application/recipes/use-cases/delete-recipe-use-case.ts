import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';

export interface DeleteRecipeInput {
  readonly id: string;
  readonly requesterId: string;
}

export class DeleteRecipeUseCase {
  constructor(private readonly repo: IRecipeRepository) {}

  async execute(input: DeleteRecipeInput): Promise<Result<void, Failure>> {
    const found = await this.repo.getById(input.id);
    if (!found.ok) return found;

    if (found.value.recipe.ownerId !== input.requesterId) {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    const deleted = await this.repo.delete(input.id);
    if (!deleted.ok) return deleted;

    return ok(undefined);
  }
}
