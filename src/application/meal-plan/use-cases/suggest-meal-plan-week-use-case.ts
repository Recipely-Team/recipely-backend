import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { MealSlotType } from '@domain/diary/meal-slot';
import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';
import { draftWeek } from '@domain/meal-plan/week-draft/draft-week';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { FavoriteRepositoryInterface } from '@domain/favorites/favorite-repository-interface';
import { MealPlanMapper } from '@application/meal-plan/mappers/meal-plan.mapper';
import type { WeekSuggestionDto } from '@application/meal-plan/dtos/week-suggestion.dto';

export interface SuggestMealPlanWeekInput {
  readonly userId: string;
  readonly weekStart: string;
  readonly meals: readonly MealSlotType[];
  readonly seed: number;
  readonly locale: string;
}

/** Enough of each list to plan from; a week needs at most 28 meals and 28 swaps. */
const POOL_PAGE = 100;
/** How far back a planned recipe still counts as recent. */
const RECENT_DAYS = 14;
const WEEK_DAYS = 7;

/**
 * "Plan my week": a draft from the user's Saved, Liked and own recipes.
 *
 * @remarks
 * - **Nothing is written.** The user takes picks or swaps, and the app adds
 *   them as ordinary entries; a suggestion the user ignores leaves no trace.
 * - **A meal that is already planned is left alone.** The draft fills the
 *   gaps of a week rather than replacing what the user chose.
 * - **Recent means planned in the two weeks before**, the window the
 *   "same five recipes" complaint is about.
 */
export class SuggestMealPlanWeekUseCase {
  constructor(
    private readonly plans: MealPlanRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
    private readonly favorites: FavoriteRepositoryInterface,
  ) {}

  async execute(input: SuggestMealPlanWeekInput): Promise<Result<WeekSuggestionDto, Failure>> {
    const week = MealPlanRange.week(input.weekStart);
    if (!week.ok) return week;
    const start = week.value.from;

    const planned = await this.plans.listEntries(input.userId, week.value);
    if (!planned.ok) return planned;
    const before = MealPlanRange.create(start.plusDays(-RECENT_DAYS).toString(), start.plusDays(-1).toString());
    if (!before.ok) return before;
    const recent = await this.plans.listEntries(input.userId, before.value);
    if (!recent.ok) return recent;

    const pool = await this.pool(input);
    if (!pool.ok) return pool;

    const taken = new Set(planned.value.map((e) => `${e.date.toString()}|${e.meal}`));
    const slots = Array.from({ length: WEEK_DAYS }, (_, day) => start.plusDays(day)).flatMap((date) =>
      input.meals.filter((meal) => !taken.has(`${date.toString()}|${meal}`)).map((meal) => ({ date, meal })),
    );
    const drafted = draftWeek({
      candidates: [...pool.value.values()].map((r) => ({ id: r.id, category: r.category })),
      recentIds: new Set([...recent.value, ...planned.value].map((e) => e.recipeId)),
      slots,
      seed: input.seed,
    });

    const dto = (id: string | null) => {
      const recipe = id === null ? undefined : pool.value.get(id);
      return recipe === undefined ? null : MealPlanMapper.recipe(recipe, input.locale);
    };
    return ok({
      weekStart: start.toString(),
      poolSize: pool.value.size,
      slots: drafted.map((s) => ({ date: s.date.toString(), meal: s.meal, pick: dto(s.pickId), alternative: dto(s.alternativeId) })),
    });
  }

  /** Saved, then liked, then the user's own: one entry per recipe. */
  private async pool(input: SuggestMealPlanWeekInput): Promise<Result<Map<string, Recipe>, Failure>> {
    const base = { locale: input.locale, page: 1, pageSize: POOL_PAGE, currentUserId: input.userId };
    const lists = await Promise.all([
      this.favorites.listForUser(input.userId, 1, POOL_PAGE),
      this.recipes.list({ ...base, likedOnly: true }),
      this.recipes.list({ ...base, ownerId: input.userId, includeUnpublished: true }),
    ]);
    const pool = new Map<string, Recipe>();
    for (const list of lists) {
      if (!list.ok) return list;
      for (const recipe of list.value.items) if (!pool.has(recipe.id)) pool.set(recipe.id, recipe);
    }
    return ok(pool);
  }
}
