import type { PageResult } from '@domain/common/page-result';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import type { CalendarDate } from '@domain/diary/calendar-date';
import type { CalendarMonth } from '@domain/diary/calendar-month';
import type { FoodLogEntry } from '@domain/diary/food-log-entry';
import type { NutritionGoals } from '@domain/diary/nutrition-goals';
import { Nutrients } from '@domain/diary/nutrients';
import { MEAL_SLOTS } from '@domain/diary/meal-slot';
import type {
  DiaryDayRecord,
  DiaryDaySummary,
  DiaryEntryRecord,
  FoodDiaryRepositoryInterface,
} from '@domain/diary/food-diary-repository-interface';

/** A food diary held in memory, with the owner scoping the Prisma one has. */
export class InMemoryFoodDiaryRepository implements FoodDiaryRepositoryInterface {
  readonly entries = new Map<string, FoodLogEntry>();
  readonly water = new Map<string, number>();
  readonly goals = new Map<string, NutritionGoals>();
  purged: string[] = [];

  private record(entry: FoodLogEntry): DiaryEntryRecord {
    return { entry, recipeImageUrl: entry.recipeId === null ? null : `https://img.test/${entry.recipeId}.jpg` };
  }

  private owned(userId: string): FoodLogEntry[] {
    return [...this.entries.values()].filter((e) => e.userId === userId);
  }

  async getDay(userId: string, date: CalendarDate): Promise<Result<DiaryDayRecord, Failure>> {
    const entries = this.owned(userId)
      .filter((e) => e.date.toString() === date.toString())
      .sort((a, b) => MEAL_SLOTS.indexOf(a.meal) - MEAL_SLOTS.indexOf(b.meal) || +a.createdAt - +b.createdAt)
      .map((e) => this.record(e));
    return ok({ entries, waterGlasses: this.water.get(`${userId}|${date.toString()}`) ?? 0 });
  }

  async summarizeMonth(userId: string, month: CalendarMonth): Promise<Result<DiaryDaySummary[], Failure>> {
    const byDay = new Map<string, FoodLogEntry[]>();
    for (const e of this.owned(userId)) {
      const day = e.date.toString();
      if (day < month.firstDay.toString() || day > month.lastDay.toString()) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), e]);
    }
    return ok(
      [...byDay.entries()].sort().map(([, es]) => ({
        date: (es[0] as FoodLogEntry).date,
        nutrients: es.reduce((sum, e) => sum.plus(e.nutrients), Nutrients.zero()),
        entryCount: es.length,
      })),
    );
  }

  async listRecent(userId: string, limit: number): Promise<Result<DiaryEntryRecord[], Failure>> {
    const seen = new Set<string>();
    const latest: FoodLogEntry[] = [];
    for (const e of this.owned(userId).sort((a, b) => +b.createdAt - +a.createdAt)) {
      const key = `${e.name.toLowerCase()}|${e.recipeId ?? ''}|${e.product?.foodVariantId ?? ''}|${e.product?.offBarcode ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      latest.push(e);
    }
    return ok(latest.slice(0, limit).map((e) => this.record(e)));
  }

  async listRecentPage(userId: string, page: number, pageSize: number): Promise<Result<PageResult<DiaryEntryRecord>, Failure>> {
    const all = await this.listRecent(userId, Number.MAX_SAFE_INTEGER);
    if (!all.ok) return all;
    return ok({ items: all.value.slice((page - 1) * pageSize, page * pageSize), total: all.value.length, page, pageSize });
  }

  async findEntry(id: string, userId: string): Promise<Result<DiaryEntryRecord, Failure>> {
    const e = this.entries.get(id);
    if (!e || e.userId !== userId) return fail(new NotFoundFailure('errors.not_found.diary_entry'));
    return ok(this.record(e));
  }

  async insertEntry(entry: FoodLogEntry): Promise<Result<DiaryEntryRecord, Failure>> {
    this.entries.set(entry.id, entry);
    return ok(this.record(entry));
  }

  async updateEntry(entry: FoodLogEntry): Promise<Result<DiaryEntryRecord, Failure>> {
    const existing = this.entries.get(entry.id);
    if (!existing || existing.userId !== entry.userId) return fail(new NotFoundFailure('errors.not_found.diary_entry'));
    this.entries.set(entry.id, entry);
    return ok(this.record(entry));
  }

  async deleteEntry(id: string, userId: string): Promise<Result<void, Failure>> {
    const e = this.entries.get(id);
    if (!e || e.userId !== userId) return fail(new NotFoundFailure('errors.not_found.diary_entry'));
    this.entries.delete(id);
    return ok(undefined);
  }

  async setWater(userId: string, date: CalendarDate, glasses: number): Promise<Result<void, Failure>> {
    this.water.set(`${userId}|${date.toString()}`, glasses);
    return ok(undefined);
  }

  async getGoals(userId: string): Promise<Result<NutritionGoals | null, Failure>> {
    return ok(this.goals.get(userId) ?? null);
  }

  async saveGoals(userId: string, goals: NutritionGoals): Promise<Result<NutritionGoals, Failure>> {
    this.goals.set(userId, goals);
    return ok(goals);
  }

  async purgeUser(userId: string): Promise<Result<void, Failure>> {
    this.purged.push(userId);
    for (const e of this.owned(userId)) this.entries.delete(e.id);
    this.goals.delete(userId);
    return ok(undefined);
  }
}
