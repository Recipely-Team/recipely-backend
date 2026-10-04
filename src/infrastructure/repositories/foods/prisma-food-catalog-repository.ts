import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { FoodSource } from '@domain/foods/food-source';
import { isFoodUnit } from '@domain/foods/food-unit';
import type { PageResult } from '@domain/common/page-result';
import type { FoodCatalogInterface, FoodCatalogQuery } from '@application/foods/ports/food-catalog-interface';
import type { FoodProductData } from '@application/foods/food-product-data';
import type { FoodDetailData } from '@application/foods/food-detail-data';
import type { FoodCategoryData } from '@application/foods/food-category-data';
import { containsEveryWord, folded, searchWords } from '@infrastructure/prisma/folded-search-sql';
import {
  foodProductFromRow,
  per100FromRow,
  servingUnitsFromJson,
  stringRecord,
  type FoodVariantRow,
} from '@infrastructure/prisma/mappers/food-variant.row-mapper';

/** The columns every variant read selects, aliased to {@link FoodVariantRow}. */
const COLUMNS = Prisma.sql`
  v.id AS "variantId", v.names AS "variantNames",
  (SELECT COUNT(*)::int FROM food_variants c WHERE c.food_id = f.id) AS "variantCount",
  v.kcal, v.protein, v.carbs, v.fat, v.fiber, v.sugar, v.salt,
  v.serving_units AS "servingUnits",
  f.id AS "foodId", f.category, f.names AS "foodNames", f.default_unit AS "defaultUnit"`;

/**
 * **The curated catalogue (`food_categories`, `foods`, `food_variants`).**
 *
 * @remarks
 * - Matching is the recipe search's (`folded-search-sql`): every word, folded,
 *   against the food's name followed by the variant's name IN THE SAME LOCALE
 *   — so "cola zero" finds Cola · Zero sugar and "ayran" every ayran, but
 *   words are never borrowed from two languages.
 * - Order: with a term, foods whose name starts with it first; then catalogue
 *   rank (most common first), the variant's position and its id — total, so
 *   pages never overlap. Page and count run in one transaction.
 * - Small (a few hundred rows), so a scan is fine.
 */
export class PrismaFoodCatalogRepository implements FoodCatalogInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async search(query: FoodCatalogQuery): Promise<Result<PageResult<FoodProductData>, Failure>> {
    const words = searchWords(query.term ?? '');
    const term = query.term?.trim() ?? '';
    const filters: Prisma.Sql[] = [];
    if (words.length > 0) {
      filters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM jsonb_each_text(f.names) AS named(locale, title)
        WHERE ${containsEveryWord(Prisma.sql`(named.title || ' ' || COALESCE(v.names ->> named.locale, ''))`, words)}
      )`);
    }
    if (query.category !== undefined) filters.push(Prisma.sql`f.category = ${query.category}`);
    const where = filters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
    const prefixFirst =
      words.length > 0
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM jsonb_each_text(f.names) AS named(locale, title)
            WHERE ${folded(Prisma.raw('named.title'))} LIKE ${folded(Prisma.sql`${`${term.replace(/([%_\\])/g, '\\$1')}%`}`)} ESCAPE '\\'
          ) DESC,`
        : Prisma.empty;
    try {
      const [rows, totals] = await this.prisma.$transaction([
        this.prisma.$queryRaw<FoodVariantRow[]>`
          SELECT ${COLUMNS}
          FROM food_variants v JOIN foods f ON f.id = v.food_id
          ${where}
          ORDER BY ${prefixFirst} f.rank ASC, v.position ASC, v.id ASC
          LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
        this.prisma.$queryRaw<Array<{ total: number }>>`
          SELECT COUNT(*)::int AS total FROM food_variants v JOIN foods f ON f.id = v.food_id ${where}`,
      ]);
      const items = rows.flatMap((row) => foodProductFromRow(row) ?? []);
      return ok({ items, total: totals[0]?.total ?? 0, page: query.page, pageSize: query.pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findVariant(id: string): Promise<Result<FoodProductData | null, Failure>> {
    try {
      const rows = await this.prisma.$queryRaw<FoodVariantRow[]>`
        SELECT ${COLUMNS} FROM food_variants v JOIN foods f ON f.id = v.food_id WHERE v.id = ${id}::uuid`;
      const row = rows[0];
      return ok(row === undefined ? null : foodProductFromRow(row));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findFood(id: string): Promise<Result<FoodDetailData | null, Failure>> {
    try {
      const food = await this.prisma.food.findUnique({
        where: { id },
        include: { variants: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
      });
      const names = food === null ? null : stringRecord(food.names);
      if (food === null || names === null || !isFoodUnit(food.defaultUnit)) return ok(null);
      return ok({
        source: FoodSource.Curated,
        foodId: food.id,
        offBarcode: null,
        category: food.category,
        names,
        brand: null,
        packSize: null,
        defaultUnit: food.defaultUnit,
        imageUrl: null,
        variants: food.variants.map((variant) => ({
          foodVariantId: variant.id,
          names: stringRecord(variant.names),
          per100: per100FromRow(variant),
          servingUnits: servingUnitsFromJson(variant.servingUnits),
        })),
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listCategories(page: number, pageSize: number): Promise<Result<PageResult<FoodCategoryData>, Failure>> {
    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.foodCategory.findMany({
          orderBy: [{ rank: 'asc' }, { key: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { _count: { select: { foods: true } } },
        }),
        this.prisma.foodCategory.count(),
      ]);
      const items = rows.map((row) => ({ key: row.key, names: stringRecord(row.names) ?? {}, productCount: row._count.foods }));
      return ok({ items, total, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
