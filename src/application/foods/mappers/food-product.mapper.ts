import { foodKindOf } from '@domain/foods/food-kind';
import type { Per100Nutrients } from '@domain/foods/per-100-nutrients';
import type { FoodProductData } from '@application/foods/food-product-data';
import type { FoodDetailData } from '@application/foods/food-detail-data';
import type { FoodCategoryData } from '@application/foods/food-category-data';
import type { FoodProductDto } from '@application/foods/dtos/food-product.dto';
import type { FoodDetailDto } from '@application/foods/dtos/food-detail.dto';
import type { FoodCategoryDto } from '@application/foods/dtos/food-category.dto';
import type { Per100Dto } from '@application/foods/dtos/per-100.dto';

const FALLBACK_LOCALE = 'en';

/** **Food read models → wire**, names resolved to one locale (then English, then any). */
export class FoodProductMapper {
  static toDto(product: FoodProductData, locale: string): FoodProductDto {
    return {
      source: product.source,
      foodId: product.foodId,
      foodVariantId: product.foodVariantId,
      offBarcode: product.offBarcode,
      kind: foodKindOf(product.defaultUnit),
      category: product.category,
      name: FoodProductMapper.pick(product.names, locale) ?? '',
      variantName: product.variantNames === null ? null : FoodProductMapper.pick(product.variantNames, locale),
      variantCount: product.variantCount,
      brand: product.brand,
      packSize: product.packSize,
      unit: product.defaultUnit,
      per100: FoodProductMapper.per100(product.per100),
      servingUnits: product.servingUnits,
      imageUrl: product.imageUrl,
    };
  }

  static toDetailDto(food: FoodDetailData, locale: string): FoodDetailDto {
    return {
      source: food.source,
      foodId: food.foodId,
      offBarcode: food.offBarcode,
      kind: foodKindOf(food.defaultUnit),
      category: food.category,
      name: FoodProductMapper.pick(food.names, locale) ?? '',
      brand: food.brand,
      packSize: food.packSize,
      unit: food.defaultUnit,
      imageUrl: food.imageUrl,
      variants: food.variants.map((variant) => ({
        foodVariantId: variant.foodVariantId,
        name: variant.names === null ? null : FoodProductMapper.pick(variant.names, locale),
        per100: FoodProductMapper.per100(variant.per100),
        servingUnits: variant.servingUnits,
      })),
    };
  }

  /** An Open Food Facts product as a one-variant detail. */
  static brandedDetail(product: FoodProductData): FoodDetailData {
    return {
      source: product.source,
      foodId: null,
      offBarcode: product.offBarcode,
      category: null,
      names: product.names,
      brand: product.brand,
      packSize: product.packSize,
      defaultUnit: product.defaultUnit,
      imageUrl: product.imageUrl,
      variants: [{ foodVariantId: null, names: null, per100: product.per100, servingUnits: product.servingUnits }],
    };
  }

  static toCategoryDto(category: FoodCategoryData, locale: string): FoodCategoryDto {
    return { key: category.key, name: FoodProductMapper.pick(category.names, locale) ?? category.key, productCount: category.productCount };
  }

  static per100(values: Per100Nutrients): Per100Dto {
    return { kcal: values.calories, protein: values.protein, carbs: values.carbs, fat: values.fat, fiber: values.fiber };
  }

  static pick(names: Readonly<Record<string, string>>, locale: string): string | null {
    return names[locale] ?? names[FALLBACK_LOCALE] ?? Object.values(names)[0] ?? null;
  }
}
