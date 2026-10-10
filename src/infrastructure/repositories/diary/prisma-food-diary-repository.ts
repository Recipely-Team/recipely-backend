import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import type { CalendarMonth } from '@domain/diary/calendar-month';
import type { FoodLogEntry } from '@domain/diary/food-log-entry';
import { NutritionGoals } from '@domain/diary/nutrition-goals';
import { Nutrients } from '@domain/diary/nutrients';
import type {
  DiaryDayRecord,
  DiaryDaySummary,
  DiaryEntryRecord,
  FoodDiaryRepositoryInterface,
} from '@domain/diary/food-diary-repository-interface';
import type { PageResult } from '@domain/common/page-result';
import { FoodLogEntryRowMapper, type FoodLogEntryRow } from '@infrastructure/prisma/mappers/food-log-entry.row-mapper';

/** Only the cover, and only while the recipe is live — a deleted recipe's photo is not ours to show. */
const WITH_RECIPE_COVER = { recipe: { select: { image: true, deletedAt: true } } } as const;

type EntryWithCover = Prisma.FoodLogEntryGetPayload<{ include: typeof WITH_RECIPE_COVER }>;

const PRISMA_RECORD_NOT_FOUND = 'P2025';

const flatten = ({ recipe, ...row }: EntryWithCover): FoodLogEntryRow => ({
  ...row,
  recipeImageUrl: recipe !== null && recipe.deletedAt === null ? recipe.image : null,
});

const entryNotFound = (): Result<never, Failure> => fail(new NotFoundFailure('errors.not_found.diary_entry'));

export class PrismaFoodDiaryRepository implements FoodDiaryRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async getDay(userId: string, date: CalendarDate): Promise<Result<DiaryDayRecord, Failure>> {
    try {
      const day = date.toDate();
      const [rows, water] = await this.prisma.$transaction([
        this.prisma.foodLogEntry.findMany({
          where: { userId, date: day },
          include: WITH_RECIPE_COVER,
          orderBy: [{ meal: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.diaryDayWater.findUnique({ where: { userId_date: { userId, date: day } } }),
      ]);
      const entries = FoodLogEntryRowMapper.toDomainList(rows.map(flatten));
      if (!entries.ok) return entries;
      return ok({ entries: entries.value, waterGlasses: water?.glasses ?? 0 });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async summarizeMonth(userId: string, month: CalendarMonth): Promise<Result<DiaryDaySummary[], Failure>> {
    try {
      const groups = await this.prisma.foodLogEntry.groupBy({
        by: ['date'],
        where: { userId, date: { gte: month.firstDay.toDate(), lte: month.lastDay.toDate() } },
        _sum: { calories: true, protein: true, carbs: true, fat: true, fiber: true },
        _count: { _all: true },
        orderBy: { date: 'asc' },
      });
      return ok(
        groups.map((group) => ({
          date: CalendarDate.fromDate(group.date),
          nutrients: Nutrients.total({
            calories: group._sum.calories ?? 0,
            protein: group._sum.protein ?? 0,
            carbs: group._sum.carbs ?? 0,
            fat: group._sum.fat ?? 0,
            fiber: group._sum.fiber ?? 0,
          }),
          entryCount: group._count._all,
        })),
      );
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listRecent(userId: string, limit: number): Promise<Result<DiaryEntryRecord[], Failure>> {
    try {
      const rows = await this.prisma.$queryRaw<FoodLogEntryRow[]>`
        SELECT * FROM (${latestPerFood(userId)}) latest
        ORDER BY "createdAt" DESC
        LIMIT ${limit}`;
      return FoodLogEntryRowMapper.toDomainList(rows);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listRecentPage(userId: string, page: number, pageSize: number): Promise<Result<PageResult<DiaryEntryRecord>, Failure>> {
    try {
      const [rows, totals] = await this.prisma.$transaction([
        this.prisma.$queryRaw<FoodLogEntryRow[]>`
          SELECT * FROM (${latestPerFood(userId)}) latest
          ORDER BY "createdAt" DESC, id DESC
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        this.prisma.$queryRaw<Array<{ total: number }>>`
          SELECT COUNT(*)::int AS total FROM (${latestPerFood(userId)}) latest`,
      ]);
      const items = FoodLogEntryRowMapper.toDomainList(rows);
      if (!items.ok) return items;
      return ok({ items: items.value, total: totals[0]?.total ?? 0, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async findEntry(id: string, userId: string): Promise<Result<DiaryEntryRecord, Failure>> {
    try {
      const row = await this.prisma.foodLogEntry.findFirst({ where: { id, userId }, include: WITH_RECIPE_COVER });
      if (!row) return entryNotFound();
      return FoodLogEntryRowMapper.toDomain(flatten(row));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async insertEntry(entry: FoodLogEntry): Promise<Result<DiaryEntryRecord, Failure>> {
    try {
      const row = await this.prisma.foodLogEntry.create({
        data: { id: entry.id, userId: entry.userId, recipeId: entry.recipeId, ...productColumns(entry), ...columns(entry) },
        include: WITH_RECIPE_COVER,
      });
      return FoodLogEntryRowMapper.toDomain(flatten(row));
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async updateEntry(entry: FoodLogEntry): Promise<Result<DiaryEntryRecord, Failure>> {
    try {
      const row = await this.prisma.foodLogEntry.update({
        where: { id: entry.id, userId: entry.userId },
        data: columns(entry),
        include: WITH_RECIPE_COVER,
      });
      return FoodLogEntryRowMapper.toDomain(flatten(row));
    } catch (err) {
      if (isRecordNotFound(err)) return entryNotFound();
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async deleteEntry(id: string, userId: string): Promise<Result<void, Failure>> {
    try {
      const { count } = await this.prisma.foodLogEntry.deleteMany({ where: { id, userId } });
      if (count === 0) return entryNotFound();
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async setWater(userId: string, date: CalendarDate, glasses: number): Promise<Result<void, Failure>> {
    try {
      const day = date.toDate();
      await this.prisma.diaryDayWater.upsert({
        where: { userId_date: { userId, date: day } },
        update: { glasses },
        create: { userId, date: day, glasses },
      });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getGoals(userId: string): Promise<Result<NutritionGoals | null, Failure>> {
    try {
      const row = await this.prisma.nutritionGoals.findUnique({ where: { userId } });
      if (!row) return ok(null);
      const { calories, protein, carbs, fat, fiber, waterGlasses } = row;
      return NutritionGoals.create({ calories, protein, carbs, fat, fiber, waterGlasses });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async saveGoals(userId: string, goals: NutritionGoals): Promise<Result<NutritionGoals, Failure>> {
    try {
      await this.prisma.nutritionGoals.upsert({
        where: { userId },
        update: { ...goals.values },
        create: { userId, ...goals.values },
      });
      return ok(goals);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async purgeUser(userId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.$transaction([
        // The plan is the diary's forward half: private, no audit value.
        this.prisma.mealPlanEntry.deleteMany({ where: { userId } }),
        this.prisma.foodLogEntry.deleteMany({ where: { userId } }),
        this.prisma.diaryDayWater.deleteMany({ where: { userId } }),
        this.prisma.nutritionGoals.deleteMany({ where: { userId } }),
      ]);
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

/**
 * The newest entry per distinct food (name, effective recipe link, product).
 *
 * A recent food is offered for re-logging, so its recipe link must pass the
 * same readability rule `RecipeRepositoryInterface.getById` applies (live, and
 * published or the user's own). A deleted or since-hidden recipe drops to a
 * plain food — otherwise re-logging it failed with not_found.recipe. Dedupe
 * runs on that effective link and the product. DISTINCT ON keeps the newest
 * row per food; callers re-sort the survivors by recency, which DISTINCT ON's
 * own ORDER BY cannot.
 */
function latestPerFood(userId: string): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT ON (lower(f.name), f."recipeId", f."foodVariantId", f."offBarcode") f.* FROM (
      SELECT
        e.id, e.user_id AS "userId", e.date, e.meal::text AS meal, e.name, e.servings,
        e.calories, e.protein, e.carbs, e.fat, e.fiber,
        e.created_at AS "createdAt", e.updated_at AS "updatedAt",
        e.product_source AS "productSource", e.food_variant_id AS "foodVariantId",
        e.off_barcode AS "offBarcode", e.unit_key AS "unitKey", e.unit_amount AS "unitAmount",
        fv.food_id AS "productFoodId",
        CASE WHEN readable.ok THEN e.recipe_id END AS "recipeId",
        CASE WHEN readable.ok THEN r.image END AS "recipeImageUrl"
      FROM food_log_entries e
      LEFT JOIN recipes r ON r.id = e.recipe_id
      LEFT JOIN food_variants fv ON fv.id = e.food_variant_id
      CROSS JOIN LATERAL (
        SELECT r.id IS NOT NULL AND r.deleted_at IS NULL
          AND (r.is_published OR r.owner_id = e.user_id) AS ok
      ) readable
      WHERE e.user_id = ${userId}::uuid
    ) f
    ORDER BY lower(f.name), f."recipeId", f."foodVariantId", f."offBarcode", f."createdAt" DESC`;
}

/** The columns an entry's owner can change — everything but identity and links. */
function columns(entry: FoodLogEntry) {
  return {
    date: entry.date.toDate(),
    meal: entry.meal,
    name: entry.name,
    servings: entry.servings,
    ...entry.nutrients.values,
  };
}

/** The product an entry was logged from — written once, like the recipe link. */
function productColumns(entry: FoodLogEntry) {
  const product = entry.product;
  return {
    productSource: product?.source ?? null,
    foodVariantId: product?.foodVariantId ?? null,
    offBarcode: product?.offBarcode ?? null,
    unitKey: product?.unitKey ?? null,
    unitAmount: product?.unitAmount ?? null,
  };
}

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_RECORD_NOT_FOUND;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
