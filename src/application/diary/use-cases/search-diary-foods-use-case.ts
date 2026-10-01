import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { DiaryRecipeSearchInterface } from '@application/diary/ports/diary-recipe-search-interface';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import type { BrandedFoodSearchInterface } from '@application/foods/ports/branded-food-search-interface';
import type { FoodProductData } from '@application/foods/food-product-data';
import type { DiaryFoodSearchDto } from '@application/diary/dtos/diary-food-search.dto';
import type { DiaryRecipeHitDto } from '@application/diary/dtos/diary-recipe-hit.dto';
import type { FoodProductDto } from '@application/foods/dtos/food-product.dto';
import { DiaryRecipeHitMapper } from '@application/diary/mappers/diary-recipe-hit.mapper';
import { FoodProductMapper } from '@application/foods/mappers/food-product.mapper';
import { DiarySearchLimits } from '@application/diary/diary-search-limits';
import { DiaryFoodGroup, type DiaryFoodGroupType, type DiaryRecipeGroupType } from '@application/diary/diary-food-group';

export interface SearchDiaryFoodsInput {
  readonly userId: string;
  readonly q: string;
  readonly locale: string;
  /** Page one group alone; absent answers the first page of every group. */
  readonly group?: DiaryFoodGroupType;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * **`GET /diary/foods/search`** — everything "Add food" can log, from the
 * server rather than whatever the phone happens to have loaded.
 *
 * @remarks
 * - Groups, in order: `saved` (favourites), `mine` (own recipes in any status,
 *   drafts included), `products` (curated catalogue first, then Open Food
 *   Facts), `recipes` (other users' published ones). A recipe appears in one
 *   group only. Every group is a `PageResult`; `group` pages one on its own.
 * - `products` is the curated matches, paged in the database, followed by up
 *   to {@link DiarySearchLimits.BrandedMax} Open Food Facts matches; `total`
 *   counts both, so paging walks from one into the other.
 * - An empty `q` is refused (`errors.validation.search_query_required`): there
 *   is nothing to search for, and the screen shows recent foods instead.
 * - Open Food Facts is best effort: a failure is logged and `products` carries
 *   the curated matches alone. A term shorter than
 *   {@link DiarySearchLimits.BrandedMinLength} skips it.
 */
export class SearchDiaryFoodsUseCase {
  constructor(
    private readonly recipes: DiaryRecipeSearchInterface,
    private readonly catalog: FoodCatalogInterface,
    private readonly branded: BrandedFoodSearchInterface,
    private readonly logger: LoggerInterface,
  ) {}

  async execute(
    input: SearchDiaryFoodsInput,
  ): Promise<Result<DiaryFoodSearchDto | PageResult<DiaryRecipeHitDto> | PageResult<FoodProductDto>, Failure>> {
    const term = input.q.trim();
    if (term.length === 0) return fail(new ValidationFailure('errors.validation.search_query_required', 'q'));
    const at = { term, input };

    if (input.group === DiaryFoodGroup.Products) return this.products(at, input.page);
    if (input.group !== undefined) return this.recipeGroup(at, input.group, input.page);

    const [saved, mine, products, recipes] = await Promise.all([
      this.recipeGroup(at, DiaryFoodGroup.Saved, 1),
      this.recipeGroup(at, DiaryFoodGroup.Mine, 1),
      this.products(at, 1),
      this.recipeGroup(at, DiaryFoodGroup.Recipes, 1),
    ]);
    if (!saved.ok) return saved;
    if (!mine.ok) return mine;
    if (!products.ok) return products;
    if (!recipes.ok) return recipes;
    return ok({ query: term, saved: saved.value, mine: mine.value, products: products.value, recipes: recipes.value });
  }

  private async recipeGroup(at: Lookup, group: DiaryRecipeGroupType, page: number): Promise<Result<PageResult<DiaryRecipeHitDto>, Failure>> {
    const { input, term } = at;
    const found = await this.recipes.search({ userId: input.userId, term, group, page, pageSize: input.pageSize });
    if (!found.ok) return found;
    return ok({ ...found.value, items: found.value.items.map((recipe) => DiaryRecipeHitMapper.toDto(recipe, input.locale)) });
  }

  private async products(at: Lookup, page: number): Promise<Result<PageResult<FoodProductDto>, Failure>> {
    const { input, term } = at;
    const { pageSize } = input;
    const [curated, branded] = await Promise.all([
      this.catalog.search({ term, page, pageSize }),
      this.brandedMatches(term, input.locale),
    ]);
    if (!curated.ok) return curated;

    // Curated rows come first; the page's free slots are filled from the
    // branded list, starting where the curated total left off.
    const from = Math.max(0, (page - 1) * pageSize - curated.value.total);
    const fill = branded.slice(from, from + pageSize - curated.value.items.length);
    const items = [...curated.value.items, ...fill].map((product) => FoodProductMapper.toDto(product, input.locale));
    return ok({ items, total: curated.value.total + branded.length, page, pageSize });
  }

  private async brandedMatches(term: string, locale: string): Promise<FoodProductData[]> {
    if (term.length < DiarySearchLimits.BrandedMinLength) return [];
    const found = await this.branded.search(term, locale, DiarySearchLimits.BrandedMax);
    if (found.ok) return found.value;
    this.logger.warn({ messageKey: found.failure.messageKey }, 'diary_branded_search_failed');
    return [];
  }
}

interface Lookup {
  readonly term: string;
  readonly input: SearchDiaryFoodsInput;
}
