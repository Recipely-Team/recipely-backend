import { fail } from '@core/result/result';
import { ServiceUnavailableFailure } from '@core/failure';
import { ListFoodProductsUseCase } from '@application/foods/use-cases/list-food-products-use-case';
import { GetFoodProductUseCase } from '@application/foods/use-cases/get-food-product-use-case';
import { GetBrandedProductUseCase } from '@application/foods/use-cases/get-branded-product-use-case';
import { ListFoodCategoriesUseCase } from '@application/foods/use-cases/list-food-categories-use-case';
import { brandedProduct, brandedWith, catalogWith, curatedProduct } from '../../fixtures/food-products';

const FOOD_ID = '22222222-2222-4222-8222-222222222222';

describe('ListFoodProductsUseCase', () => {
  it('browses the catalogue paged, passing the filters through, names in the locale', async () => {
    const catalog = catalogWith(curatedProduct(), curatedProduct({ foodVariantId: 'v2', variantNames: { en: 'Regular', tr: 'Klasik' } }));
    const result = await new ListFoodProductsUseCase(catalog).execute({ q: ' ayran ', category: 'drinks', locale: 'en', page: 2, pageSize: 1 });
    expect(catalog.search).toHaveBeenCalledWith({ term: 'ayran', category: 'drinks', page: 2, pageSize: 1 });
    expect(result.ok && result.value).toMatchObject({ total: 2, page: 2, pageSize: 1, items: [{ name: 'Ayran', variantName: 'Regular' }] });
  });

  it('lists everything without a term or category', async () => {
    const catalog = catalogWith(curatedProduct());
    await new ListFoodProductsUseCase(catalog).execute({ q: '  ', locale: 'tr', page: 1, pageSize: 20 });
    expect(catalog.search).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });
});

describe('GetFoodProductUseCase', () => {
  it('answers a food with every variant and its serving units', async () => {
    const catalog = catalogWith(curatedProduct(), curatedProduct({ foodVariantId: 'v2', variantNames: { en: 'Regular', tr: 'Klasik' } }));
    const result = await new GetFoodProductUseCase(catalog).execute({ foodId: FOOD_ID, locale: 'tr' });
    expect(result.ok && result.value).toMatchObject({
      source: 'curated', foodId: FOOD_ID, kind: 'drink', unit: 'ml', name: 'Ayran',
      variants: [
        { foodVariantId: curatedProduct().foodVariantId, name: 'Az yağlı', per100: { kcal: 28 }, servingUnits: [{ key: 'glass', amount: 200 }] },
        { foodVariantId: 'v2', name: 'Klasik' },
      ],
    });
  });

  it('answers not_found.food for an unknown food', async () => {
    const result = await new GetFoodProductUseCase(catalogWith()).execute({ foodId: FOOD_ID, locale: 'tr' });
    expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.food');
  });
});

describe('GetBrandedProductUseCase', () => {
  it('answers an Open Food Facts product as a one-variant detail', async () => {
    const result = await new GetBrandedProductUseCase(brandedWith(brandedProduct())).execute({ barcode: '8681324002837', locale: 'tr' });
    expect(result.ok && result.value).toMatchObject({
      source: 'openfoodfacts', foodId: null, offBarcode: '8681324002837', brand: 'Sütaş', packSize: '285 ml', name: 'Ayran',
      variants: [{ foodVariantId: null, name: null, per100: { kcal: 32 }, servingUnits: [{ key: 'pack', amount: 285 }] }],
    });
  });

  it('answers not_found.food for an unknown barcode', async () => {
    const result = await new GetBrandedProductUseCase(brandedWith()).execute({ barcode: '12345678', locale: 'tr' });
    expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.food');
  });

  it('passes an outage through — there is nothing else to show here', async () => {
    const branded = brandedWith();
    branded.findByBarcode.mockResolvedValue(fail(new ServiceUnavailableFailure('errors.foods.branded_unavailable')));
    const result = await new GetBrandedProductUseCase(branded).execute({ barcode: '12345678', locale: 'tr' });
    expect(!result.ok && result.failure.code).toBe('service_unavailable');
  });
});

describe('ListFoodCategoriesUseCase', () => {
  it('names each shelf in the request locale, paged', async () => {
    const result = await new ListFoodCategoriesUseCase(catalogWith(curatedProduct())).execute({ locale: 'tr', page: 1, pageSize: 20 });
    expect(result.ok && result.value).toEqual({ items: [{ key: 'drinks', name: 'İçecekler', productCount: 1 }], total: 1, page: 1, pageSize: 20 });
  });
});
