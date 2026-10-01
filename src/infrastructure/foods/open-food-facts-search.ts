import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { BrandedFoodSearchInterface } from '@application/foods/ports/branded-food-search-interface';
import type { FoodProductData } from '@application/foods/food-product-data';
import { TtlCache } from '@infrastructure/cache/ttl-cache';
import { OffProductResponse, OffSearchHit, OffSearchResponse } from '@infrastructure/foods/off-search-hit';
import { offProductFromHit } from '@infrastructure/foods/off-product.mapper';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const HTTP_NOT_FOUND = 404;
const FIELDS = 'code,product_name,brands,quantity,image_front_small_url,nutriments';
const REQUEST_TIMEOUT_MS = 2_500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
/** Ask for more than shown: the plausibility filter drops some hits. */
const OVERFETCH = 2;
const PAGE_SIZE_MAX = 40;
const FALLBACK_LANG = 'en';
/** Lucene's special characters, escaped so a user's term is searched, not parsed. */
const LUCENE_SPECIAL = /([+\-!(){}[\]^"~*?:\\/&|])/g;
/** Markets a locale's users shop in; a locale missing here searches the whole world. */
const COUNTRY_BY_LOCALE: Readonly<Record<string, string>> = { tr: 'en:turkey' };

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;

/**
 * **Branded products from Open Food Facts' search API.**
 *
 * @remarks
 * - Market first: a Turkish-locale search asks for products sold in Turkey,
 *   and only when that finds nothing asks the whole database.
 * - Best effort: a timeout (2.5 s), an error status or an unreadable answer is
 *   a `ServiceUnavailableFailure` the use case drops; nothing is thrown.
 * - Answers are cached for six hours, bounded in size — searches per
 *   (locale, term, limit), products per (locale, barcode), "no such product"
 *   included; failures are not cached.
 * - A barcode is read from the product API; a 404 there is "no product".
 * - Identifies itself as `Recipely/1.0 (<contact>)`, as Open Food Facts asks
 *   of API users.
 */
export class OpenFoodFactsSearch implements BrandedFoodSearchInterface {
  private readonly cache = new TtlCache<FoodProductData[]>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);
  private readonly products = new TtlCache<FoodProductData | null>(CACHE_TTL_MS, CACHE_MAX_ENTRIES);

  constructor(
    private readonly contactEmail: string,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async search(term: string, locale: string, limit: number): Promise<Result<FoodProductData[], Failure>> {
    const query = term.trim().toLowerCase().replace(LUCENE_SPECIAL, '\\$1');
    const key = `${locale}|${query}|${limit}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return ok(cached);

    const country = COUNTRY_BY_LOCALE[locale];
    let products = await this.request(country !== undefined ? `${query} AND countries_tags:"${country}"` : query, locale, limit);
    if (products.ok && products.value.length === 0 && country !== undefined) {
      products = await this.request(query, locale, limit);
    }
    if (products.ok) this.cache.set(key, products.value);
    return products;
  }

  async findByBarcode(barcode: string, locale: string): Promise<Result<FoodProductData | null, Failure>> {
    const key = `${locale}|${barcode}`;
    const cached = this.products.get(key);
    if (cached !== undefined) return ok(cached);
    try {
      const response = await this.fetchImpl(
        `${PRODUCT_URL}/${encodeURIComponent(barcode)}?${new URLSearchParams({ fields: FIELDS, lc: locale }).toString()}`,
        { headers: this.headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      if (response.status === HTTP_NOT_FOUND) return this.remember(key, null);
      if (!response.ok) {
        logger.warn({ status: response.status }, 'off_product_refused');
        return unavailable();
      }
      const body = OffProductResponse.safeParse(await response.json());
      if (!body.success) {
        logger.warn({}, 'off_product_unreadable_answer');
        return unavailable();
      }
      const hit = OffSearchHit.safeParse(body.data.product);
      return this.remember(key, hit.success ? offProductFromHit(hit.data, locale) : null);
    } catch (err) {
      logger.warn({ reason: err instanceof Error ? err.message : String(err) }, 'off_product_failed');
      return unavailable();
    }
  }

  private remember(key: string, product: FoodProductData | null): Result<FoodProductData | null, Failure> {
    this.products.set(key, product);
    return ok(product);
  }

  private headers(): Record<string, string> {
    return { 'User-Agent': `Recipely/1.0 (${this.contactEmail})`, Accept: 'application/json' };
  }

  private async request(q: string, locale: string, limit: number): Promise<Result<FoodProductData[], Failure>> {
    const params = new URLSearchParams({
      q,
      langs: locale === FALLBACK_LANG ? FALLBACK_LANG : `${locale},${FALLBACK_LANG}`,
      page_size: String(Math.min(limit * OVERFETCH, PAGE_SIZE_MAX)),
      fields: FIELDS,
    });
    try {
      const response = await this.fetchImpl(`${SEARCH_URL}?${params.toString()}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, 'off_search_refused');
        return unavailable();
      }
      const body = OffSearchResponse.safeParse(await response.json());
      if (!body.success) {
        logger.warn({}, 'off_search_unreadable_answer');
        return unavailable();
      }
      const products = body.data.hits.flatMap((raw) => {
        const hit = OffSearchHit.safeParse(raw);
        return hit.success ? offProductFromHit(hit.data, locale) ?? [] : [];
      });
      const unique = products.filter((p, i) => products.findIndex((o) => o.offBarcode === p.offBarcode) === i);
      return ok(unique.slice(0, limit));
    } catch (err) {
      logger.warn({ reason: err instanceof Error ? err.message : String(err) }, 'off_search_failed');
      return unavailable();
    }
  }
}

function unavailable(): Result<never, Failure> {
  return fail(new ServiceUnavailableFailure('errors.foods.branded_unavailable'));
}
