import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { IFavoriteRepository } from '@domain/favorites/i-favorite-repository';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { PagedRecipesDto } from '@application/recipes/dtos/recipe.dto';

export interface ListMyFavoritesInput {
  readonly userId: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly locale?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class ListMyFavoritesUseCase {
  constructor(private readonly favorites: IFavoriteRepository) {}

  async execute(input: ListMyFavoritesInput): Promise<Result<PagedRecipesDto, Failure>> {
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const locale = input.locale ?? 'en';

    if (!Number.isInteger(page) || page < 1) {
      return fail(new ValidationFailure('errors.validation.page_invalid', 'page'));
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      return fail(new ValidationFailure('errors.validation.page_size_invalid', 'pageSize'));
    }

    // Favorites list always belongs to the authenticated user, so they are always
    // the currentUserId for social enrichment (likedByMe is accurate for their own view).
    const result = await this.favorites.listForUser(input.userId, page, pageSize);
    if (!result.ok) return result;
    return ok(RecipeMapper.toPagedDto(result.value, locale));
  }
}
