import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure, UnknownFailure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { DiaryRecipeSearchInterface, DiaryRecipeSearchQuery } from '@application/diary/ports/diary-recipe-search-interface';
import { SearchDiaryFoodsUseCase, type SearchDiaryFoodsInput } from '@application/diary/use-cases/search-diary-foods-use-case';
import type { DiaryFoodSearchDto } from '@application/diary/dtos/diary-food-search.dto';
import { recipe, recipeProps } from '../../fixtures/recipe-fixture';
import { brandedProduct, brandedWith, catalogWith, curatedProduct } from '../../fixtures/food-products';

const USER = 'user-1';
const input = (overrides: Partial<SearchDiaryFoodsInput> = {}): SearchDiaryFoodsInput => ({
  userId: USER, q: 'ayran', locale: 'tr', page: 1, pageSize: 20, ...overrides,
});

/** One named recipe per group, so a test can see which group answered. */
function recipesByGroup(): DiaryRecipeSearchInterface & { search: jest.Mock } {
  return {
    search: jest.fn(async (q: DiaryRecipeSearchQuery) =>
      ok({
        items: [recipe(recipeProps({ id: `${q.group}-1`, name: { en: `${q.group} ayran`, tr: `${q.group} ayranı` } }))],
        total: 1,
        page: q.page,
        pageSize: q.pageSize,
      }),
    ),
  };
}

function setup(products = [curatedProduct()], branded = [brandedProduct()]) {
  const recipes = recipesByGroup();
  const catalog = catalogWith(...products);
  const off = brandedWith(...branded);
  const logger = { warn: jest.fn() };
  return { recipes, catalog, off, logger, useCase: new SearchDiaryFoodsUseCase(recipes, catalog, off, logger) };
}

describe('SearchDiaryFoodsUseCase — every group at once', () => {
  it('answers saved, mine, products and recipes, each a page of its own', async () => {
    const { useCase } = setup();
    const result = await useCase.execute(input());
    if (!result.ok) throw new Error(result.failure.messageKey);
    const dto = result.value as DiaryFoodSearchDto;
    expect(Object.keys(dto)).toEqual(['query', 'saved', 'mine', 'products', 'recipes']);
    expect(dto.saved).toMatchObject({ total: 1, page: 1, pageSize: 20, items: [{ id: 'saved-1', name: 'saved ayranı' }] });
    expect(dto.mine.items[0]?.id).toBe('mine-1');
    expect(dto.recipes.items[0]?.id).toBe('recipes-1');
    expect(dto.products).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(dto.products.items.map((p) => p.source)).toEqual(['curated', 'openfoodfacts']);
  });

  it('carries what logging a recipe needs, per serving, with its status for a draft', async () => {
    const { recipes, useCase } = setup();
    recipes.search.mockImplementation(async (q: DiaryRecipeSearchQuery) =>
      ok({
        items: [recipe(recipeProps({ id: 'mine-1', servings: 4, caloriesPerServing: 320, nutrition: { protein: 12, carbs: 40 }, image: 'https://x/c.jpg' }))],
        total: 1, page: q.page, pageSize: q.pageSize,
      }),
    );
    const result = await useCase.execute(input());
    const hit = result.ok ? (result.value as DiaryFoodSearchDto).mine.items[0] : undefined;
    expect(hit).toEqual({
      id: 'mine-1', name: 'Pasta', image: 'https://x/c.jpg', servings: 4, caloriesPerServing: 320,
      protein: 12, carbs: 40, fat: null, fiber: null, servingWeightGrams: null,
      status: ModerationStatus.Unreviewed, isPublished: false,
    });
  });

  it('names products in the request locale with the variant apart, and per-100 as the design asks', async () => {
    const { useCase } = setup();
    const result = await useCase.execute(input());
    const [curated, branded] = result.ok ? (result.value as DiaryFoodSearchDto).products.items : [];
    expect(curated).toMatchObject({
      name: 'Ayran', variantName: 'Az yağlı', variantCount: 3, kind: 'drink', unit: 'ml',
      per100: { kcal: 28, protein: 1.8, carbs: 2.6, fat: 1, fiber: 0 },
      servingUnits: [{ key: 'glass', amount: 200 }],
    });
    expect(curated?.per100).not.toHaveProperty('sugar');
    expect(branded).toMatchObject({ brand: 'Sütaş', packSize: '285 ml', offBarcode: '8681324002837', variantName: null });
  });

  it('searches as the signed-in user, every group from its first page', async () => {
    const { recipes, useCase } = setup();
    await useCase.execute(input({ q: '  ayran  ' }));
    const groups = recipes.search.mock.calls.map(([q]) => [q.group, q.term, q.userId, q.page]);
    expect(groups).toEqual([
      ['saved', 'ayran', USER, 1],
      ['mine', 'ayran', USER, 1],
      ['recipes', 'ayran', USER, 1],
    ]);
  });
});

describe('SearchDiaryFoodsUseCase — one group, paged', () => {
  it('answers that group alone as a PageResult', async () => {
    const { recipes, useCase } = setup();
    const result = await useCase.execute(input({ group: 'recipes', page: 3, pageSize: 5 }));
    expect(result.ok && result.value).toMatchObject({ total: 1, page: 3, pageSize: 5, items: [{ id: 'recipes-1' }] });
    expect(recipes.search).toHaveBeenCalledTimes(1);
  });

  // 3 curated + 4 branded, 2 per page: page 2 is the last curated row then
  // the first branded one, page 4 the last branded one.
  it('walks the products from the curated rows into the branded ones', async () => {
    const curated = [1, 2, 3].map((i) => curatedProduct({ foodVariantId: `c${i}` }));
    const branded = [1, 2, 3, 4].map((i) => brandedProduct({ offBarcode: `1234567${i}` }));
    const { useCase } = setup(curated, branded);
    const page = async (n: number) => {
      const result = await useCase.execute(input({ group: 'products', page: n, pageSize: 2 }));
      if (!result.ok) throw new Error('search failed');
      return result.value as { items: Array<{ foodVariantId: string | null; offBarcode: string | null }>; total: number };
    };
    const ids = (p: Awaited<ReturnType<typeof page>>) => p.items.map((i) => i.foodVariantId ?? i.offBarcode);
    expect((await page(1)).total).toBe(7);
    expect(ids(await page(1))).toEqual(['c1', 'c2']);
    expect(ids(await page(2))).toEqual(['c3', '12345671']);
    expect(ids(await page(3))).toEqual(['12345672', '12345673']);
    expect(ids(await page(4))).toEqual(['12345674']);
    expect(ids(await page(5))).toEqual([]);
  });
});

describe('SearchDiaryFoodsUseCase — edges', () => {
  it.each(['', '   '])('refuses an empty query %p with search_query_required', async (q) => {
    const { recipes, useCase } = setup();
    const result = await useCase.execute(input({ q }));
    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.search_query_required');
    expect(recipes.search).not.toHaveBeenCalled();
  });

  it('keeps the curated products when Open Food Facts fails, and logs it', async () => {
    const { off, logger, useCase } = setup();
    off.search.mockResolvedValue(fail(new ServiceUnavailableFailure('errors.foods.branded_unavailable')));
    const result = await useCase.execute(input());
    expect(result.ok && (result.value as DiaryFoodSearchDto).products.items.map((p) => p.source)).toEqual(['curated']);
    expect(logger.warn).toHaveBeenCalledWith({ messageKey: 'errors.foods.branded_unavailable' }, 'diary_branded_search_failed');
  });

  it('does not ask Open Food Facts for a one-letter term', async () => {
    const { off, useCase } = setup();
    await useCase.execute(input({ q: 'a' }));
    expect(off.search).not.toHaveBeenCalled();
  });

  it('fails the search when the database fails', async () => {
    const { catalog, useCase } = setup();
    catalog.search.mockResolvedValue(fail(new UnknownFailure('db down')));
    expect((await useCase.execute(input())).ok).toBe(false);
  });
});
