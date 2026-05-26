import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';

export class GetRecipeUseCase {
  constructor(private readonly repo: IRecipeRepository) {}

  async execute(id: string, locale: string = 'en', currentUserId?: string): Promise<Result<RecipeDto, Failure>> {
    if (!id || id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }

    const result = await this.repo.getById(
      id,
      ...(currentUserId !== undefined ? [currentUserId] : []),
    );
    if (!result.ok) return result;

    // Fire-and-forget: increment view count without blocking the response.
    this.repo.incrementViewCount(id).catch(() => {});

    return ok(RecipeMapper.toDto(result.value.recipe, locale, result.value.social));
  }
}
