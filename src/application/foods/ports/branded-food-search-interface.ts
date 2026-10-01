import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FoodProductData } from '@application/foods/food-product-data';

/**
 * Branded, packaged products from an outside database (Open Food Facts).
 *
 * @remarks
 * - Best effort by contract: a slow or failing upstream answers a Failure; a
 *   search caller drops it rather than fail.
 * - `locale` steers language and market (a Turkish user sees products sold in
 *   Turkey first).
 */
export interface BrandedFoodSearchInterface {
  /** The best matches, plausibility-filtered, at most `limit`. */
  search(term: string, locale: string, limit: number): Promise<Result<FoodProductData[], Failure>>;
  /** One product by barcode; `null` when the database has none worth offering. */
  findByBarcode(barcode: string, locale: string): Promise<Result<FoodProductData | null, Failure>>;
}
