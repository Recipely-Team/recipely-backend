import { fail, ok } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { MealSlot } from '@domain/diary/meal-slot';
import { FoodSource } from '@domain/foods/food-source';
import type { LoggedProductProps } from '@domain/diary/logged-product';
import { AddFoodLogEntryUseCase, type AddFoodLogEntryInput } from '@application/diary/use-cases/add-food-log-entry-use-case';
import { ListRecentFoodsPageUseCase } from '@application/diary/use-cases/list-recent-foods-page-use-case';
import { InMemoryFoodDiaryRepository } from '../../fixtures/in-memory-food-diary-repository';
import { AYRAN_LOW_FAT_ID, catalogWith, curatedProduct } from '../../fixtures/food-products';

const ME = 'user-me';
const curated = (overrides: Partial<LoggedProductProps> = {}): LoggedProductProps => ({
  source: FoodSource.Curated, foodVariantId: AYRAN_LOW_FAT_ID, offBarcode: null, unitKey: 'glass', unitAmount: 1, ...overrides,
});
const branded = (overrides: Partial<LoggedProductProps> = {}): LoggedProductProps => ({
  source: FoodSource.OpenFoodFacts, foodVariantId: null, offBarcode: '8681324002837', unitKey: 'pack', unitAmount: 285, ...overrides,
});

function setup() {
  const repo = new InMemoryFoodDiaryRepository();
  const recipes = { getById: jest.fn() } as unknown as RecipeRepositoryInterface;
  const catalog = catalogWith(curatedProduct());
  return { repo, catalog, add: new AddFoodLogEntryUseCase(repo, recipes, catalog), recent: new ListRecentFoodsPageUseCase(repo) };
}

// Two glasses of low-fat ayran: 2 × (200 ml × 28 kcal / 100) = 112 kcal.
const input = (product: LoggedProductProps | null, overrides: Partial<AddFoodLogEntryInput> = {}): AddFoodLogEntryInput => ({
  userId: ME, date: '2026-10-01', meal: MealSlot.Lunch, name: 'Ayran · Az yağlı', servings: 2,
  nutrients: { calories: 112, protein: 7.2, carbs: 10.4, fat: 4, fiber: 0 }, recipeId: null, product, ...overrides,
});

describe('AddFoodLogEntryUseCase — products', () => {
  it('logs a curated variant by its serving unit, sizing the unit from the catalogue', async () => {
    const s = setup();
    const added = await s.add.execute(input(curated({ unitAmount: 999 })));
    expect(added.ok && added.value).toMatchObject({
      servings: 2, calories: 112,
      product: { source: 'curated', foodVariantId: AYRAN_LOW_FAT_ID, offBarcode: null, unitKey: 'glass', unitAmount: 200 },
    });
  });

  it('logs a curated variant in its base unit as 1 g/ml per unit', async () => {
    const s = setup();
    const added = await s.add.execute(input(curated({ unitKey: 'ml', unitAmount: 50 }), { servings: 250 }));
    expect(added.ok && added.value.product).toMatchObject({ unitKey: 'ml', unitAmount: 1 });
  });

  it.each([
    ['a unit the variant does not offer', curated({ unitKey: 'slice' })],
    ['grams for a drink', curated({ unitKey: 'g' })],
    ['an Open Food Facts product by the glass', branded({ unitKey: 'glass' })],
  ])('refuses %s with food_unit_invalid', async (_label, product) => {
    const s = setup();
    const added = await s.add.execute(input(product));
    expect(!added.ok && added.failure.messageKey).toBe('errors.validation.food_unit_invalid');
    expect(s.repo.entries.size).toBe(0);
  });

  it('refuses a variant the catalogue does not have with not_found.food', async () => {
    const s = setup();
    const added = await s.add.execute(input(curated({ foodVariantId: '99999999-9999-4999-8999-999999999999' })));
    expect(!added.ok && added.failure.messageKey).toBe('errors.not_found.food');
  });

  it('passes a catalogue failure through', async () => {
    const s = setup();
    s.catalog.findVariant.mockResolvedValue(fail(new UnknownFailure('db down')));
    expect((await s.add.execute(input(curated()))).ok).toBe(false);
  });

  it('logs an Open Food Facts product by its pack, keeping the pack size sent', async () => {
    const s = setup();
    const added = await s.add.execute(input(branded(), { servings: 1 }));
    expect(added.ok && added.value.product).toEqual({
      source: 'openfoodfacts', foodVariantId: null, offBarcode: '8681324002837', unitKey: 'pack', unitAmount: 285,
    });
  });

  it('logs an Open Food Facts product in grams as 1 g per unit', async () => {
    const s = setup();
    const added = await s.add.execute(input(branded({ unitKey: 'g', unitAmount: 40 }), { servings: 150 }));
    expect(added.ok && added.value.product).toMatchObject({ unitKey: 'g', unitAmount: 1 });
  });

  it('refuses a product together with a recipe', async () => {
    const s = setup();
    const readable = { getById: jest.fn().mockResolvedValue(ok({})) } as unknown as RecipeRepositoryInterface;
    const added = await new AddFoodLogEntryUseCase(s.repo, readable, s.catalog).execute(input(curated(), { recipeId: 'recipe-1' }));
    expect(!added.ok && added.failure.messageKey).toBe('errors.validation.food_product_invalid');
  });

  it('keeps a quick-add entry unchanged: no product', async () => {
    const s = setup();
    const added = await s.add.execute(input(null));
    expect(added.ok && added.value.product).toBeNull();
  });
});

describe('ListRecentFoodsPageUseCase', () => {
  it('offers a logged product again as one unit, paged with the distinct-food total', async () => {
    const s = setup();
    await s.add.execute(input(curated()));
    await s.add.execute(input(null, { name: 'Elma', nutrients: { calories: 95, protein: null, carbs: 25, fat: null, fiber: 4 }, servings: 1 }));

    const page1 = await s.recent.execute({ userId: ME, page: 1, pageSize: 1 });
    const page2 = await s.recent.execute({ userId: ME, page: 2, pageSize: 1 });
    expect(page1.ok && { total: page1.value.total, page: page1.value.page, pageSize: page1.value.pageSize }).toEqual({ total: 2, page: 1, pageSize: 1 });
    const items = [...(page1.ok ? page1.value.items : []), ...(page2.ok ? page2.value.items : [])];
    const ayran = items.find((i) => i.product !== null);
    expect(ayran).toMatchObject({ servings: 1, calories: 56, product: { unitKey: 'glass', unitAmount: 200 } });
  });
});
