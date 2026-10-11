import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import { MEAL_SLOTS } from '@domain/diary/meal-slot';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { MealPlanEntry } from '@domain/meal-plan/meal-plan-entry';
import type { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import type { MealPlanRecord, MealPlanRepositoryInterface } from '@domain/meal-plan/meal-plan-repository-interface';

/**
 * A meal plan held in memory, with the owner scoping and the recipe
 * readability rule the Prisma one has. `recipes` is shared with
 * {@link recipeRepoOver}, so a test can hide a recipe after planning it.
 */
export class InMemoryMealPlanRepository implements MealPlanRepositoryInterface {
  readonly entries = new Map<string, MealPlanEntry>();
  readonly recipes = new Map<string, Recipe>();
  /** Soft-deleted recipe ids. */
  readonly deleted = new Set<string>();

  readable(userId: string, recipeId: string): Recipe | null {
    const recipe = this.recipes.get(recipeId);
    if (recipe === undefined || this.deleted.has(recipeId)) return null;
    return recipe.isPublished || recipe.ownerId === userId ? recipe : null;
  }

  async listRange(userId: string, range: MealPlanRange): Promise<Result<MealPlanRecord[], Failure>> {
    const records: MealPlanRecord[] = [];
    for (const entry of this.sorted(userId, range)) {
      const recipe = this.readable(userId, entry.recipeId);
      if (recipe !== null) records.push({ entry, recipe });
    }
    return ok(records);
  }

  async listEntries(userId: string, range: MealPlanRange): Promise<Result<MealPlanEntry[], Failure>> {
    return ok(this.sorted(userId, range));
  }

  async find(id: string, userId: string): Promise<Result<MealPlanRecord, Failure>> {
    const entry = this.entries.get(id);
    const recipe = entry !== undefined && entry.userId === userId ? this.readable(userId, entry.recipeId) : null;
    if (entry === undefined || recipe === null) return fail(new NotFoundFailure('errors.not_found.meal_plan_entry'));
    return ok({ entry, recipe });
  }

  async insert(entries: readonly MealPlanEntry[]): Promise<Result<void, Failure>> {
    for (const entry of entries) this.entries.set(entry.id, entry);
    return ok(undefined);
  }

  async update(entry: MealPlanEntry): Promise<Result<void, Failure>> {
    const current = this.entries.get(entry.id);
    if (current === undefined || current.userId !== entry.userId) return fail(new NotFoundFailure('errors.not_found.meal_plan_entry'));
    this.entries.set(entry.id, this.withLink(entry, current.foodLogEntryId));
    return ok(undefined);
  }

  async linkEaten(id: string, userId: string, foodLogEntryId: string): Promise<Result<boolean, Failure>> {
    const current = this.entries.get(id);
    if (current === undefined || current.userId !== userId || current.eaten) return ok(false);
    this.entries.set(id, this.withLink(current, foodLogEntryId));
    return ok(true);
  }

  async unlinkEaten(id: string, userId: string, foodLogEntryId: string): Promise<Result<void, Failure>> {
    const current = this.entries.get(id);
    if (current !== undefined && current.userId === userId && current.foodLogEntryId === foodLogEntryId) {
      this.entries.set(id, this.withLink(current, null));
    }
    return ok(undefined);
  }

  async delete(id: string, userId: string): Promise<Result<void, Failure>> {
    const current = this.entries.get(id);
    if (current === undefined || current.userId !== userId) return fail(new NotFoundFailure('errors.not_found.meal_plan_entry'));
    this.entries.delete(id);
    return ok(undefined);
  }

  async deleteRange(userId: string, range: MealPlanRange): Promise<Result<number, Failure>> {
    const gone = this.sorted(userId, range);
    for (const entry of gone) this.entries.delete(entry.id);
    return ok(gone.length);
  }

  private sorted(userId: string, range: MealPlanRange): MealPlanEntry[] {
    const from = range.from.toString();
    const to = range.to.toString();
    return [...this.entries.values()]
      .filter((e) => e.userId === userId && e.date.toString() >= from && e.date.toString() <= to)
      .sort(
        (a, b) =>
          a.date.toString().localeCompare(b.date.toString()) ||
          MEAL_SLOTS.indexOf(a.meal) - MEAL_SLOTS.indexOf(b.meal) ||
          a.position - b.position,
      );
  }

  private withLink(entry: MealPlanEntry, foodLogEntryId: string | null): MealPlanEntry {
    const rebuilt = MealPlanEntry.create({
      id: entry.id,
      userId: entry.userId,
      date: entry.date,
      meal: entry.meal,
      recipeId: entry.recipeId,
      servings: entry.servings,
      position: entry.position,
      foodLogEntryId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    });
    if (!rebuilt.ok) throw new Error(rebuilt.failure.messageKey);
    return rebuilt.value;
  }
}

/** `getById` over the same recipe map, with the same readability rule. */
export function recipeRepoOver(plan: InMemoryMealPlanRepository): RecipeRepositoryInterface {
  return {
    getById: async (id: string, userId?: string) => {
      const recipe = userId === undefined ? null : plan.readable(userId, id);
      return recipe === null
        ? fail(new NotFoundFailure('errors.not_found.recipe'))
        : ok({ recipe, social: { likeCount: 0, likedByMe: false, commentCount: 0 } });
    },
  } as unknown as RecipeRepositoryInterface;
}
