import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipeQuery, RecipeSort } from '@domain/recipes/recipe-query';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { PagedRecipesDto } from '@application/recipes/dtos/recipe.dto';

export interface ListRecipesInput {
  readonly search?: string;
  readonly ownerId?: string;
  readonly includeUnpublished?: boolean;
  readonly cuisines?: CuisineKey[];
  readonly categories?: RecipeCategory[];
  readonly difficulties?: Difficulty[];
  readonly maxTime?: number;
  readonly sort?: RecipeSort;
  readonly sortOrder?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
  readonly locale?: string;
  readonly currentUserId?: string;
  readonly likedOnly?: boolean;
  readonly personalize?: boolean;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class ListRecipesUseCase {
  constructor(private readonly repo: IRecipeRepository) {}

  async execute(input: ListRecipesInput): Promise<Result<PagedRecipesDto, Failure>> {
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const locale = input.locale ?? 'en';

    if (!Number.isInteger(page) || page < 1) {
      return fail(new ValidationFailure('errors.validation.page_invalid', 'page'));
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      return fail(
        new ValidationFailure('errors.validation.page_size_invalid', 'pageSize'),
      );
    }

    // likedOnly without auth is a programming error at the controller layer.
    // Defense-in-depth: return validation failure here too.
    if (input.likedOnly === true && input.currentUserId === undefined) {
      return fail(new ValidationFailure('errors.validation.auth_required_for_liked_only', 'likedOnly'));
    }

    const search = input.search?.trim();
    const ownerId = input.ownerId?.trim();
    const query: RecipeQuery = {
      page,
      pageSize,
      locale,
      ...(search ? { search } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(input.includeUnpublished ? { includeUnpublished: true } : {}),
      ...(input.cuisines && input.cuisines.length > 0 ? { cuisines: input.cuisines } : {}),
      ...(input.categories && input.categories.length > 0 ? { categories: input.categories } : {}),
      ...(input.difficulties && input.difficulties.length > 0
        ? { difficulties: input.difficulties }
        : {}),
      ...(input.maxTime !== undefined ? { maxTime: input.maxTime } : {}),
      ...(input.sort !== undefined ? { sort: input.sort } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.currentUserId !== undefined ? { currentUserId: input.currentUserId } : {}),
      ...(input.likedOnly === true ? { likedOnly: true } : {}),
    };
    const result = await this.repo.list(query);

    if (!result.ok) return result;

    // Personalization: re-rank in memory if the user is authenticated and personalize=true.
    if (input.personalize === true && input.currentUserId !== undefined) {
      const prefsResult = await this.repo.getPreferencesForUser(input.currentUserId);
      if (prefsResult.ok) {
        const { categories, cuisines } = prefsResult.value;
        const prefCategorySet = new Set<string>(categories);
        const prefCuisineSet = new Set<string>(cuisines);

        const preferred: typeof result.value.items = [];
        const rest: typeof result.value.items = [];

        for (const item of result.value.items) {
          const raw = item.toRaw();
          if (prefCategorySet.has(raw.category) || prefCuisineSet.has(raw.cuisine)) {
            preferred.push(item);
          } else {
            rest.push(item);
          }
        }

        const reranked = { ...result.value, items: [...preferred, ...rest] };
        return ok(RecipeMapper.toPagedDto(reranked, locale));
      }
      // If preferences fetch fails, fall through to serve without personalization.
    }

    return ok(RecipeMapper.toPagedDto(result.value, locale));
  }
}
