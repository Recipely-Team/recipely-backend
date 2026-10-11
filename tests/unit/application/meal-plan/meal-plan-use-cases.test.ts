import { MealSlot } from '@domain/diary/meal-slot';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';
import { AddFoodLogEntryUseCase } from '@application/diary/use-cases/add-food-log-entry-use-case';
import { GetMealPlanUseCase } from '@application/meal-plan/use-cases/get-meal-plan-use-case';
import { AddMealPlanEntryUseCase } from '@application/meal-plan/use-cases/add-meal-plan-entry-use-case';
import { UpdateMealPlanEntryUseCase } from '@application/meal-plan/use-cases/update-meal-plan-entry-use-case';
import { DeleteMealPlanEntryUseCase } from '@application/meal-plan/use-cases/delete-meal-plan-entry-use-case';
import { MarkMealPlanEntryEatenUseCase } from '@application/meal-plan/use-cases/mark-meal-plan-entry-eaten-use-case';
import { UnmarkMealPlanEntryEatenUseCase } from '@application/meal-plan/use-cases/unmark-meal-plan-entry-eaten-use-case';
import { CopyMealPlanWeekUseCase } from '@application/meal-plan/use-cases/copy-meal-plan-week-use-case';
import { ClearMealPlanRangeUseCase } from '@application/meal-plan/use-cases/clear-meal-plan-range-use-case';
import { ListMealPlanIngredientsUseCase } from '@application/meal-plan/use-cases/list-meal-plan-ingredients-use-case';
import { InMemoryMealPlanRepository, recipeRepoOver } from '../../fixtures/in-memory-meal-plan-repository';
import { InMemoryFoodDiaryRepository } from '../../fixtures/in-memory-food-diary-repository';
import { recipe, recipeProps } from '../../fixtures/recipe-fixture';

const ME = 'u1';
const OTHER = 'u2';
const MON = '2026-10-12';

function setup() {
  const repo = new InMemoryMealPlanRepository();
  const diary = new InMemoryFoodDiaryRepository();
  const recipes = recipeRepoOver(repo);
  repo.recipes.set('soup', recipe(recipeProps({
    id: 'soup', name: { en: 'Lentil soup', tr: 'Mercimek çorbası' }, isPublished: true, ownerId: OTHER, servings: 4,
    caloriesPerServing: 250, nutrition: { protein: 12.5, carbs: 30 }, ingredients: { en: ['1 cup lentils'], tr: ['1 su bardağı mercimek'] },
  })));
  repo.recipes.set('mine', recipe(recipeProps({ id: 'mine', name: { en: 'My pasta' }, ownerId: ME, caloriesPerServing: 0 })));
  repo.recipes.set('private', recipe(recipeProps({ id: 'private', ownerId: OTHER, isPublished: false })));
  const addFood = new AddFoodLogEntryUseCase(diary, recipes, {} as FoodCatalogInterface);
  return {
    repo,
    diary,
    get: new GetMealPlanUseCase(repo),
    add: new AddMealPlanEntryUseCase(repo, recipes),
    update: new UpdateMealPlanEntryUseCase(repo),
    remove: new DeleteMealPlanEntryUseCase(repo),
    eat: new MarkMealPlanEntryEatenUseCase(repo, addFood, diary),
    uneat: new UnmarkMealPlanEntryEatenUseCase(repo, diary),
    copy: new CopyMealPlanWeekUseCase(repo),
    clear: new ClearMealPlanRangeUseCase(repo),
    ingredients: new ListMealPlanIngredientsUseCase(repo),
  };
}

type Setup = ReturnType<typeof setup>;
const plan = async (s: Setup, overrides: Partial<{ date: string; meal: typeof MealSlot[keyof typeof MealSlot]; recipeId: string; servings: number; userId: string }> = {}) => {
  const added = await s.add.execute({ userId: ME, date: MON, meal: MealSlot.Dinner, recipeId: 'soup', servings: 2, locale: 'en', ...overrides });
  if (!added.ok) throw new Error(added.failure.messageKey);
  return added.value;
};

describe('meal plan use cases', () => {
  it('plans a readable recipe at the end of its slot and answers it localized', async () => {
    const s = setup();
    await plan(s);
    const second = await s.add.execute({ userId: ME, date: MON, meal: MealSlot.Dinner, recipeId: 'soup', servings: 1, locale: 'tr' });
    expect(second.ok && second.value).toMatchObject({
      date: MON, meal: 'DINNER', position: 1, servings: 1, eaten: false, foodLogEntryId: null,
      recipe: { id: 'soup', name: 'Mercimek çorbası', imageUrl: null, caloriesPerServing: 250, servings: 4, totalTimeMinutes: 30 },
    });
  });

  it('refuses a recipe the user cannot read with the recipe not-found key', async () => {
    const result = await setup().add.execute({ userId: ME, date: MON, meal: MealSlot.Lunch, recipeId: 'private', servings: 1, locale: 'en' });
    expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.recipe');
  });

  it(`holds a day to ${MealPlanLimits.EntriesPerDayMax} rows`, async () => {
    const s = setup();
    for (let i = 0; i < MealPlanLimits.EntriesPerDayMax; i += 1) await plan(s, { meal: MealSlot.Snack });
    const full = await s.add.execute({ userId: ME, date: MON, meal: MealSlot.Lunch, recipeId: 'soup', servings: 1, locale: 'en' });
    expect(!full.ok && [full.failure.code, full.failure.messageKey]).toEqual(['conflict', 'errors.conflict.meal_plan_day_full']);
  });

  it('reads a range by date, meal and position, and refuses a span over 14 days', async () => {
    const s = setup();
    await plan(s, { date: '2026-10-13', meal: MealSlot.Breakfast });
    await plan(s, { meal: MealSlot.Dinner });
    await plan(s, { meal: MealSlot.Breakfast, recipeId: 'mine' });
    const week = await s.get.execute({ userId: ME, from: MON, to: '2026-10-18', locale: 'en' });
    expect(week.ok && week.value.entries.map((e) => [e.date, e.meal, e.recipe.id])).toEqual([
      [MON, 'BREAKFAST', 'mine'], [MON, 'DINNER', 'soup'], ['2026-10-13', 'BREAKFAST', 'soup'],
    ]);
    const tooLong = await s.get.execute({ userId: ME, from: MON, to: '2026-10-26', locale: 'en' });
    expect(!tooLong.ok && tooLong.failure.messageKey).toBe('errors.validation.meal_plan_range_invalid');
    const backwards = await s.get.execute({ userId: ME, from: MON, to: '2026-10-11', locale: 'en' });
    expect(backwards.ok).toBe(false);
    expect((await s.get.execute({ userId: ME, from: MON, to: '2026-10-25', locale: 'en' })).ok).toBe(true);
  });

  it('leaves out a row whose recipe was hidden after planning', async () => {
    const s = setup();
    const planned = await plan(s);
    s.repo.deleted.add('soup');
    const week = await s.get.execute({ userId: ME, from: MON, to: MON, locale: 'en' });
    expect(week.ok && week.value.entries).toEqual([]);
    const update = await s.update.execute({ id: planned.id, userId: ME, locale: 'en', servings: 1 });
    expect(!update.ok && update.failure.messageKey).toBe('errors.not_found.meal_plan_entry');
  });

  it("answers someone else's row as not found, for every write", async () => {
    const s = setup();
    const planned = await plan(s);
    const id = planned.id;
    const results = [
      await s.update.execute({ id, userId: OTHER, locale: 'en', servings: 1 }),
      await s.remove.execute({ id, userId: OTHER }),
      await s.eat.execute({ id, userId: OTHER, locale: 'en' }),
      await s.uneat.execute({ id, userId: OTHER, locale: 'en' }),
    ];
    expect(results.map((r) => !r.ok && r.failure.messageKey)).toEqual(Array(4).fill('errors.not_found.meal_plan_entry'));
  });

  it('moves a row to the end of another slot, and refuses a full target day', async () => {
    const s = setup();
    await plan(s, { date: '2026-10-13', meal: MealSlot.Lunch });
    const moving = await plan(s);
    const moved = await s.update.execute({ id: moving.id, userId: ME, locale: 'en', date: '2026-10-13', meal: MealSlot.Lunch });
    expect(moved.ok && [moved.value.date, moved.value.meal, moved.value.position]).toEqual(['2026-10-13', 'LUNCH', 1]);

    for (let i = 0; i < MealPlanLimits.EntriesPerDayMax; i += 1) await plan(s, { date: '2026-10-14' });
    const blocked = await s.update.execute({ id: moving.id, userId: ME, locale: 'en', date: '2026-10-14' });
    expect(!blocked.ok && blocked.failure.messageKey).toBe('errors.conflict.meal_plan_day_full');
  });

  it('logs an eaten plan to the diary with scaled numbers, once', async () => {
    const s = setup();
    const planned = await plan(s, { servings: 1.5 });
    const eaten = await s.eat.execute({ id: planned.id, userId: ME, locale: 'tr' });
    if (!eaten.ok) throw new Error(eaten.failure.messageKey);
    expect(eaten.value.eaten).toBe(true);
    const [logged] = [...s.diary.entries.values()];
    expect(logged && [logged.id, logged.name, logged.meal, logged.date.toString(), logged.servings, logged.recipeId]).toEqual([
      eaten.value.foodLogEntryId, 'Mercimek çorbası', 'DINNER', MON, 1.5, 'soup',
    ]);
    expect(logged?.nutrients.values).toEqual({ calories: 375, protein: 18.8, carbs: 45, fat: null, fiber: null });

    const again = await s.eat.execute({ id: planned.id, userId: ME, locale: 'en' });
    expect(again.ok && again.value.foodLogEntryId).toBe(eaten.value.foodLogEntryId);
    expect(s.diary.entries.size).toBe(1);
  });

  it('deletes its own diary entry again when a concurrent request linked one first', async () => {
    const s = setup();
    const planned = await plan(s);
    jest.spyOn(s.repo, 'linkEaten').mockResolvedValueOnce({ ok: true, value: false });
    const eaten = await s.eat.execute({ id: planned.id, userId: ME, locale: 'en' });
    expect(eaten.ok).toBe(true);
    expect(s.diary.entries.size).toBe(0);
  });

  it('logs 0 kcal for a recipe whose nutrition was never calculated', async () => {
    const s = setup();
    const planned = await plan(s, { recipeId: 'mine' });
    const eaten = await s.eat.execute({ id: planned.id, userId: ME, locale: 'en' });
    expect(eaten.ok && eaten.value.recipe.caloriesPerServing).toBeNull();
    expect([...s.diary.entries.values()][0]?.nutrients.values.calories).toBe(0);
  });

  it('undoes eaten by deleting the diary entry, even when the diary already lost it', async () => {
    const s = setup();
    const planned = await plan(s);
    await s.eat.execute({ id: planned.id, userId: ME, locale: 'en' });
    const undone = await s.uneat.execute({ id: planned.id, userId: ME, locale: 'en' });
    expect(undone.ok && [undone.value.eaten, undone.value.foodLogEntryId]).toEqual([false, null]);
    expect(s.diary.entries.size).toBe(0);

    const eaten = await s.eat.execute({ id: planned.id, userId: ME, locale: 'en' });
    s.diary.entries.clear();
    const stillOk = await s.uneat.execute({ id: planned.id, userId: ME, locale: 'en' });
    expect(eaten.ok && stillOk.ok && stillOk.value.eaten).toBe(false);
  });

  it('deleting a plan row leaves its diary entry alone', async () => {
    const s = setup();
    const planned = await plan(s);
    await s.eat.execute({ id: planned.id, userId: ME, locale: 'en' });
    expect((await s.remove.execute({ id: planned.id, userId: ME })).ok).toBe(true);
    expect(s.diary.entries.size).toBe(1);
  });

  it('copies a week day for day, uneaten, and turns away what a full day cannot hold', async () => {
    const s = setup();
    const eatenRow = await plan(s, { meal: MealSlot.Breakfast });
    await s.eat.execute({ id: eatenRow.id, userId: ME, locale: 'en' });
    await plan(s, { date: '2026-10-18' });
    for (let i = 0; i < MealPlanLimits.EntriesPerDayMax; i += 1) await plan(s, { date: '2026-10-25', meal: MealSlot.Snack });

    const copied = await s.copy.execute({ userId: ME, fromWeekStart: MON, toWeekStart: '2026-10-19' });
    expect(copied.ok && copied.value).toEqual({ copied: 1, skipped: 1 });
    const target = await s.get.execute({ userId: ME, from: '2026-10-19', to: '2026-10-19', locale: 'en' });
    expect(target.ok && target.value.entries.map((e) => [e.meal, e.eaten])).toEqual([['BREAKFAST', false]]);

    const same = await s.copy.execute({ userId: ME, fromWeekStart: MON, toWeekStart: MON });
    expect(!same.ok && same.failure.messageKey).toBe('errors.validation.meal_plan_range_invalid');
  });

  it('clears a range and keeps the diary', async () => {
    const s = setup();
    const planned = await plan(s);
    await s.eat.execute({ id: planned.id, userId: ME, locale: 'en' });
    await plan(s, { date: '2026-10-20' });
    expect((await s.clear.execute({ userId: ME, from: MON, to: '2026-10-18' })).ok).toBe(true);
    expect([...s.repo.entries.values()].map((e) => e.date.toString())).toEqual(['2026-10-20']);
    expect(s.diary.entries.size).toBe(1);
    expect((await s.clear.execute({ userId: ME, from: MON, to: '2026-11-30' })).ok).toBe(false);
  });

  it('lists ingredients once per recipe with planned servings summed', async () => {
    const s = setup();
    await plan(s, { servings: 2 });
    await plan(s, { date: '2026-10-14', servings: 1.5 });
    await plan(s, { recipeId: 'mine', meal: MealSlot.Lunch, servings: 1 });
    const result = await s.ingredients.execute({ userId: ME, from: MON, to: '2026-10-18', locale: 'tr' });
    expect(result.ok && result.value.recipes).toEqual([
      { recipeId: 'mine', recipeName: 'My pasta', plannedServings: 1, recipeServings: 2, ingredients: ['pasta', 'sauce'] },
      { recipeId: 'soup', recipeName: 'Mercimek çorbası', plannedServings: 3.5, recipeServings: 4, ingredients: ['1 su bardağı mercimek'] },
    ]);
  });
});
