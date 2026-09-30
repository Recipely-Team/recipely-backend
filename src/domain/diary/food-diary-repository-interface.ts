import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { CalendarDate } from '@domain/diary/calendar-date';
import type { CalendarMonth } from '@domain/diary/calendar-month';
import type { FoodLogEntry } from '@domain/diary/food-log-entry';
import type { NutritionGoals } from '@domain/diary/nutrition-goals';
import type { Nutrients } from '@domain/diary/nutrients';

/** An entry as read back, with the cover of the recipe it came from (if any, and still live). */
export interface DiaryEntryRecord {
  readonly entry: FoodLogEntry;
  readonly recipeImageUrl: string | null;
}

export interface DiaryDayRecord {
  readonly entries: readonly DiaryEntryRecord[];
  readonly waterGlasses: number;
}

export interface DiaryDaySummary {
  readonly date: CalendarDate;
  readonly nutrients: Nutrients;
  readonly entryCount: number;
}

/**
 * The per-user food diary: entries, daily water and goals.
 *
 * @remarks
 * - **Every entry lookup is scoped by owner.** Someone else's entry id answers
 *   `not_found`, exactly like an id that never existed — a diary is private,
 *   and a `forbidden` would confirm the id is real.
 */
export interface FoodDiaryRepositoryInterface {
  /** Entries ordered by meal, then by when they were logged. */
  getDay(userId: string, date: CalendarDate): Promise<Result<DiaryDayRecord, Failure>>;
  /** One row per day with ≥1 entry, aggregated in the database. */
  summarizeMonth(userId: string, month: CalendarMonth): Promise<Result<DiaryDaySummary[], Failure>>;
  /** The latest entry per distinct food (lower(name) + recipe), newest first. */
  listRecent(userId: string, limit: number): Promise<Result<DiaryEntryRecord[], Failure>>;
  findEntry(id: string, userId: string): Promise<Result<DiaryEntryRecord, Failure>>;
  insertEntry(entry: FoodLogEntry): Promise<Result<DiaryEntryRecord, Failure>>;
  updateEntry(entry: FoodLogEntry): Promise<Result<DiaryEntryRecord, Failure>>;
  deleteEntry(id: string, userId: string): Promise<Result<void, Failure>>;
  setWater(userId: string, date: CalendarDate, glasses: number): Promise<Result<void, Failure>>;
  /** `null` when the user never saved goals. */
  getGoals(userId: string): Promise<Result<NutritionGoals | null, Failure>>;
  saveGoals(userId: string, goals: NutritionGoals): Promise<Result<NutritionGoals, Failure>>;
  /** Hard-deletes every diary row the user owns — entries, water and goals. */
  purgeUser(userId: string): Promise<Result<void, Failure>>;
}
