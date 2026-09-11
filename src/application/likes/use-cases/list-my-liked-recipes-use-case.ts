import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { RecipeLikeRepositoryInterface } from '@domain/likes/recipe-like-repository-interface';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { PagedRecipesDto } from '@application/recipes/dtos/paged-recipes.dto';

export interface ListMyLikedRecipesInput {
  readonly userId: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly locale?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * The recipes the authenticated user has liked, newest like first.
 *
 * @remarks
 * - **Own view** — the list belongs to the caller, so they are also the social
 *   context the repository enriches with; `likedByMe` is theirs, not a
 *   stranger's.
 * - **Paging is validated here** so an out-of-range page never reaches the
 *   database, mirroring `ListMyFavoritesUseCase`.
 */
export class ListMyLikedRecipesUseCase {
  constructor(private readonly likes: RecipeLikeRepositoryInterface) {}

  async execute(input: ListMyLikedRecipesInput): Promise<Result<PagedRecipesDto, Failure>> {
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const locale = input.locale ?? 'en';

    if (!Number.isInteger(page) || page < 1) {
      return fail(new ValidationFailure('errors.validation.page_invalid', 'page'));
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      return fail(new ValidationFailure('errors.validation.page_size_invalid', 'pageSize'));
    }

    const result = await this.likes.listForUser(input.userId, page, pageSize);
    if (!result.ok) return result;
    return ok(RecipeMapper.toPagedDto(result.value, locale));
  }
}
