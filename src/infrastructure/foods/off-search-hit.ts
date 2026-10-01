import { z } from 'zod';

const number = z.number().finite().nullable().optional();

/**
 * One hit of the Open Food Facts search API (search.openfoodfacts.org), with
 * only the fields asked for. Everything is optional: the database is crowd-
 * sourced and any field may be missing or malformed.
 */
export const OffSearchHit = z.object({
  code: z.string(),
  product_name: z.string().nullable().optional(),
  brands: z.union([z.array(z.string()), z.string()]).nullable().optional(),
  quantity: z.string().nullable().optional(),
  image_front_small_url: z.string().nullable().optional(),
  nutriments: z
    .object({
      'energy-kcal_100g': number,
      proteins_100g: number,
      carbohydrates_100g: number,
      fat_100g: number,
      fiber_100g: number,
      sugars_100g: number,
      salt_100g: number,
      alcohol_100g: number,
    })
    .partial()
    .nullable()
    .optional(),
});

export type OffSearchHit = z.infer<typeof OffSearchHit>;

export const OffSearchResponse = z.object({ hits: z.array(z.unknown()) });

/** The product API's answer; `product` is parsed as an {@link OffSearchHit}. */
export const OffProductResponse = z.object({ product: z.unknown() });
