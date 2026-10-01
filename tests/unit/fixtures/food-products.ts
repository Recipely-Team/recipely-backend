import { ok } from '@core/result/result';
import { FoodSource } from '@domain/foods/food-source';
import { FoodUnit } from '@domain/foods/food-unit';
import type { FoodProductData } from '@application/foods/food-product-data';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import type { BrandedFoodSearchInterface } from '@application/foods/ports/branded-food-search-interface';
import { FoodProductMapper } from '@application/foods/mappers/food-product.mapper';
import { ServingUnitKey } from '@domain/foods/serving-unit-key';

export const AYRAN_LOW_FAT_ID = '11111111-1111-4111-8111-111111111111';

export function curatedProduct(overrides: Partial<FoodProductData> = {}): FoodProductData {
  return {
    source: FoodSource.Curated,
    foodVariantId: AYRAN_LOW_FAT_ID,
    offBarcode: null,
    foodId: '22222222-2222-4222-8222-222222222222',
    category: 'drinks',
    names: { en: 'Ayran', tr: 'Ayran' },
    variantNames: { en: 'Low-fat', tr: 'Az yağlı' },
    variantCount: 3,
    brand: null,
    packSize: null,
    defaultUnit: FoodUnit.Milliliter,
    per100: { calories: 28, protein: 1.8, carbs: 2.6, fat: 1, fiber: 0, sugar: 2.6, salt: 0.6 },
    servingUnits: [{ key: ServingUnitKey.Glass, amount: 200 }],
    imageUrl: null,
    ...overrides,
  };
}

export function brandedProduct(overrides: Partial<FoodProductData> = {}): FoodProductData {
  return {
    source: FoodSource.OpenFoodFacts,
    foodVariantId: null,
    offBarcode: '8681324002837',
    foodId: null,
    category: null,
    names: { tr: 'Ayran' },
    variantNames: null,
    variantCount: 1,
    brand: 'Sütaş',
    packSize: '285 ml',
    defaultUnit: FoodUnit.Milliliter,
    per100: { calories: 32, protein: 2, carbs: 2, fat: 1.8, fiber: null, sugar: 2, salt: 0.6 },
    servingUnits: [{ key: ServingUnitKey.Pack, amount: 285 }],
    imageUrl: 'https://images.openfoodfacts.org/x.jpg',
    ...overrides,
  };
}

type Mocked<T> = { [K in keyof T]: jest.Mock };

/** A catalogue holding `products` (a single food, for `findFood`); `search` pages them as given. */
export function catalogWith(...products: FoodProductData[]): FoodCatalogInterface & Mocked<FoodCatalogInterface> {
  return {
    search: jest.fn(async ({ page, pageSize }: { page: number; pageSize: number }) =>
      ok({ items: products.slice((page - 1) * pageSize, page * pageSize), total: products.length, page, pageSize }),
    ),
    findVariant: jest.fn(async (id: string) => ok(products.find((p) => p.foodVariantId === id) ?? null)),
    findFood: jest.fn(async (id: string) => {
      const variants = products.filter((p) => p.foodId === id);
      const first = variants[0];
      if (first === undefined) return ok(null);
      return ok({
        ...FoodProductMapper.brandedDetail(first),
        source: first.source,
        foodId: first.foodId,
        category: first.category,
        variants: variants.map((p) => ({ foodVariantId: p.foodVariantId, names: p.variantNames, per100: p.per100, servingUnits: p.servingUnits })),
      });
    }),
    listCategories: jest.fn(async (page: number, pageSize: number) =>
      ok({ items: [{ key: 'drinks', names: { en: 'Drinks', tr: 'İçecekler' }, productCount: products.length }], total: 1, page, pageSize }),
    ),
  };
}

export function brandedWith(...products: FoodProductData[]): BrandedFoodSearchInterface & Mocked<BrandedFoodSearchInterface> {
  return {
    search: jest.fn().mockResolvedValue(ok(products)),
    findByBarcode: jest.fn(async (barcode: string) => ok(products.find((p) => p.offBarcode === barcode) ?? null)),
  };
}
