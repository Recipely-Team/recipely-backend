import { offProductFromHit } from '@infrastructure/foods/off-product.mapper';
import type { OffSearchHit } from '@infrastructure/foods/off-search-hit';

const hit = (overrides: Partial<OffSearchHit> = {}): OffSearchHit => ({
  code: '8681324002837',
  product_name: 'Ayran',
  brands: ['Sütaş'],
  quantity: '285 ml',
  image_front_small_url: 'https://images.openfoodfacts.org/a.jpg',
  nutriments: {
    'energy-kcal_100g': 32, proteins_100g: 2, carbohydrates_100g: 2, fat_100g: 1.8, sugars_100g: 2, salt_100g: 0.6,
  },
  ...overrides,
});

describe('offProductFromHit', () => {
  it('maps a sound hit: brand, pack size and pack unit, per-100 values, base unit from the package', () => {
    expect(offProductFromHit(hit(), 'tr')).toEqual({
      source: 'openfoodfacts', foodVariantId: null, offBarcode: '8681324002837', foodId: null, category: null,
      names: { tr: 'Ayran' }, variantNames: null, variantCount: 1, brand: 'Sütaş', packSize: '285 ml',
      defaultUnit: 'ml',
      per100: { calories: 32, protein: 2, carbs: 2, fat: 1.8, fiber: null, sugar: 2, salt: 0.6 },
      servingUnits: [{ key: 'pack', amount: 285 }],
      imageUrl: 'https://images.openfoodfacts.org/a.jpg',
    });
  });

  it.each([
    ['1,5l', 'ml', []],
    ['50 g', 'g', [{ key: 'pack', amount: 50 }]],
    ['33 cl', 'ml', [{ key: 'pack', amount: 330 }]],
    ['2 kg', 'g', []],
    [undefined, 'g', []],
  ])('reads the package %p as base %s, offering a pack of at most 1000', (quantity, unit, servingUnits) => {
    const product = offProductFromHit(hit({ quantity: quantity ?? null }), 'tr');
    expect(product?.defaultUnit).toBe(unit);
    expect(product?.servingUnits).toEqual(servingUnits);
  });

  it('takes the first brand of a comma-separated string', () => {
    expect(offProductFromHit(hit({ brands: 'Coca-Cola, The Coca-Cola Company' }), 'en')?.brand).toBe('Coca-Cola');
  });

  // Real hits: "Kola, 450 kcal" with 10.6 g carbs; "Ayran, 120 kcal" with 2 g protein, 1.8 g carbs and 1.5 g fat.
  it.each([
    ['no barcode', hit({ code: 'abc' })],
    ['no name', hit({ product_name: '  ' })],
    ['no energy', hit({ nutriments: { proteins_100g: 2 } })],
    ['energy no food has', hit({ nutriments: { 'energy-kcal_100g': 1200 } })],
    ['more than 100 g of a macro', hit({ nutriments: { 'energy-kcal_100g': 400, carbohydrates_100g: 140 } })],
    ['energy its macros contradict (cola, 450 kcal)', hit({ nutriments: { 'energy-kcal_100g': 450, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 } })],
    ['energy its macros contradict (ayran, 120 kcal)', hit({ nutriments: { 'energy-kcal_100g': 120, proteins_100g: 2, carbohydrates_100g: 1.8, fat_100g: 1.5 } })],
  ])('drops a hit with %s', (_label, bad) => {
    expect(offProductFromHit(bad, 'tr')).toBeNull();
  });

  it('counts alcohol into the energy check, so beer is kept', () => {
    const beer = hit({ nutriments: { 'energy-kcal_100g': 43, proteins_100g: 0.5, carbohydrates_100g: 3.6, fat_100g: 0, alcohol_100g: 3.9 } });
    expect(offProductFromHit(beer, 'en')).not.toBeNull();
  });
});
