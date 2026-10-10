import type { Prisma, PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import type { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRecord, MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import { MealPlanEntryRowMapper } from '@infrastructure/prisma/mappers/meal-plan-entry.row-mapper';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';

/** Date, then meal (the enum is declared in display order), then position; id breaks ties. */
const PLAN_ORDER = [
  { date: 'asc' },
  { meal: 'asc' },
  { position: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.MealPlanEntryOrderByWithRelationInput[];

const WITH_RECIPE = { recipe: { include: { media: { orderBy: { position: 'asc' } } } } } as const;

/** The rule `getById` applies: live, and published or the user's own. */
const readableBy = (userId: string): Prisma.RecipeWhereInput => ({
  deletedAt: null,
  OR: [{ isPublished: true }, { ownerId: userId }],
});

const inRange = (range: MealPlanRange) => ({ gte: range.from.toDate(), lte: range.to.toDate() });

const entryNotFound = (): Result<never, Failure> => fail(new NotFoundFailure('errors.not_found.meal_plan_entry'));

/**
 * Prisma-backed meal plan. Every query carries `userId` in its WHERE, so
 * another user's id is indistinguishable from a missing one.
 */
export class PrismaMealPlanRepository implements MealPlanRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async listRange(userId: string, range: MealPlanRange): Promise<Result<MealPlanRecord[], Failure>> {
    return this.guard(async () => {
      const rows = await this.prisma.mealPlanEntry.findMany({
        where: { userId, date: inRange(range), recipe: readableBy(userId) },
        orderBy: PLAN_ORDER,
        include: WITH_RECIPE,
      });
      const records: MealPlanRecord[] = [];
      for (const row of rows) {
        const record = toRecord(row);
        if (!record.ok) return record;
        records.push(record.value);
      }
      return ok(records);
    });
  }

  async listEntries(userId: string, range: MealPlanRange): Promise<Result<MealPlanEntry[], Failure>> {
    return this.guard(async () =>
      MealPlanEntryRowMapper.toDomainList(
        await this.prisma.mealPlanEntry.findMany({ where: { userId, date: inRange(range) }, orderBy: PLAN_ORDER }),
      ),
    );
  }

  async find(id: string, userId: string): Promise<Result<MealPlanRecord, Failure>> {
    return this.guard(async () => {
      const row = await this.prisma.mealPlanEntry.findFirst({
        where: { id, userId, recipe: readableBy(userId) },
        include: WITH_RECIPE,
      });
      return row === null ? entryNotFound() : toRecord(row);
    });
  }

  async insert(entries: readonly MealPlanEntry[]): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      await this.prisma.mealPlanEntry.createMany({ data: entries.map(MealPlanEntryRowMapper.insertColumns) });
      return ok(undefined);
    });
  }

  async update(entry: MealPlanEntry): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      const { count } = await this.prisma.mealPlanEntry.updateMany({
        where: { id: entry.id, userId: entry.userId },
        data: MealPlanEntryRowMapper.mutableColumns(entry),
      });
      return count === 0 ? entryNotFound() : ok(undefined);
    });
  }

  async linkEaten(id: string, userId: string, foodLogEntryId: string): Promise<Result<boolean, Failure>> {
    return this.guard(async () => {
      const { count } = await this.prisma.mealPlanEntry.updateMany({
        where: { id, userId, foodLogEntryId: null },
        data: { foodLogEntryId },
      });
      return ok(count > 0);
    });
  }

  async unlinkEaten(id: string, userId: string, foodLogEntryId: string): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      await this.prisma.mealPlanEntry.updateMany({ where: { id, userId, foodLogEntryId }, data: { foodLogEntryId: null } });
      return ok(undefined);
    });
  }

  async delete(id: string, userId: string): Promise<Result<void, Failure>> {
    return this.guard(async () => {
      const { count } = await this.prisma.mealPlanEntry.deleteMany({ where: { id, userId } });
      return count === 0 ? entryNotFound() : ok(undefined);
    });
  }

  async deleteRange(userId: string, range: MealPlanRange): Promise<Result<number, Failure>> {
    return this.guard(async () => {
      const { count } = await this.prisma.mealPlanEntry.deleteMany({ where: { userId, date: inRange(range) } });
      return ok(count);
    });
  }

  private async guard<T>(work: () => Promise<Result<T, Failure>>): Promise<Result<T, Failure>> {
    try {
      return await work();
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
  }
}

type RowWithRecipe = Prisma.MealPlanEntryGetPayload<{ include: typeof WITH_RECIPE }>;

function toRecord(row: RowWithRecipe): Result<MealPlanRecord, Failure> {
  const entry = MealPlanEntryRowMapper.toDomain(row);
  if (!entry.ok) return entry;
  const recipe = RecipeRowMapper.toDomain(row.recipe);
  if (!recipe.ok) return recipe;
  return ok({ entry: entry.value, recipe: recipe.value });
}
