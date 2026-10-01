import {
  BarcodeParamSchema,
  CreateFoodLogEntryBodySchema,
  DiaryFoodSearchQuerySchema,
  FoodProductsQuerySchema,
} from '@presentation/validators/diary.validators';

const entry = { date: '2026-10-01', meal: 'LUNCH', name: 'Ayran', servings: 2, calories: 112 };
const product = { source: 'curated', foodVariantId: '11111111-1111-4111-8111-111111111111', unitKey: 'glass' };

const firstMessage = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.success ? undefined : result.error?.issues[0]?.message;

describe('diary food validators', () => {
  it('accepts a product entry, defaulting the unit size to 1', () => {
    const parsed = CreateFoodLogEntryBodySchema.safeParse({ ...entry, product });
    expect(parsed.success && parsed.data.product).toEqual({ ...product, unitAmount: 1 });
  });

  it('accepts 150 units of a product', () => {
    expect(CreateFoodLogEntryBodySchema.safeParse({ ...entry, servings: 150, product: { ...product, unitKey: 'g' } }).success).toBe(true);
  });

  it.each([
    [{ ...product, source: 'usda' }, 'errors.validation.food_product_invalid'],
    [{ ...product, foodVariantId: 'nope' }, 'errors.not_found.food'],
    [{ ...product, unitAmount: 0 }, 'errors.validation.food_amount_invalid'],
    [{ ...product, unitAmount: 2001 }, 'errors.validation.food_amount_invalid'],
    [{ ...product, unitKey: 3 }, 'errors.validation.food_unit_invalid'],
  ])('refuses product %p with %s', (bad, key) => {
    expect(firstMessage(CreateFoodLogEntryBodySchema.safeParse({ ...entry, product: bad }))).toBe(key);
  });

  it('pages the search with the standard pagination and an optional group', () => {
    expect(DiaryFoodSearchQuerySchema.parse({ q: 'ayran' })).toEqual({ q: 'ayran', page: 1, pageSize: 20 });
    expect(DiaryFoodSearchQuerySchema.parse({ q: 'a', group: 'products', page: '2', pageSize: '100' })).toMatchObject({ group: 'products', page: 2, pageSize: 100 });
    expect(DiaryFoodSearchQuerySchema.safeParse({ q: 'a', pageSize: '101' }).success).toBe(false);
    expect(DiaryFoodSearchQuerySchema.safeParse({ q: 'a', group: 'all' }).success).toBe(false);
    expect(DiaryFoodSearchQuerySchema.parse({}).q).toBe('');
  });

  it('browses products with optional q and category', () => {
    expect(FoodProductsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(FoodProductsQuerySchema.parse({ category: 'drinks', q: 'kola' })).toMatchObject({ category: 'drinks', q: 'kola' });
  });

  it('takes a 6-14 digit barcode only', () => {
    expect(BarcodeParamSchema.safeParse({ barcode: '8681324002837' }).success).toBe(true);
    expect(firstMessage(BarcodeParamSchema.safeParse({ barcode: '86813-24' }))).toBe('errors.not_found.food');
  });
});
