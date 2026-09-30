import { fail, ok } from '@core/result/result';
import { ForbiddenFailure, NotFoundFailure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { MealSlot } from '@domain/diary/meal-slot';
import { AddFoodLogEntryUseCase } from '@application/diary/use-cases/add-food-log-entry-use-case';
import { UpdateFoodLogEntryUseCase } from '@application/diary/use-cases/update-food-log-entry-use-case';
import { DeleteFoodLogEntryUseCase } from '@application/diary/use-cases/delete-food-log-entry-use-case';
import { GetDiaryDayUseCase } from '@application/diary/use-cases/get-diary-day-use-case';
import { GetDiaryMonthUseCase } from '@application/diary/use-cases/get-diary-month-use-case';
import { ListRecentFoodsUseCase } from '@application/diary/use-cases/list-recent-foods-use-case';
import { SetDayWaterUseCase } from '@application/diary/use-cases/set-day-water-use-case';
import { GetNutritionGoalsUseCase } from '@application/diary/use-cases/get-nutrition-goals-use-case';
import { SetNutritionGoalsUseCase } from '@application/diary/use-cases/set-nutrition-goals-use-case';
import { InMemoryFoodDiaryRepository } from '../../fixtures/in-memory-food-diary-repository';

const ME = 'user-me';
const THEM = 'user-them';
const DEFAULT_GOALS = { calories: 2000, protein: 100, carbs: 250, fat: 70, waterGlasses: 8 };

const recipesThatFind = (found: boolean): RecipeRepositoryInterface =>
  ({
    getById: jest.fn().mockResolvedValue(found ? ok({}) : fail(new NotFoundFailure('errors.not_found.recipe'))),
  }) as unknown as RecipeRepositoryInterface;

const setup = (recipeFound = true) => {
  const repo = new InMemoryFoodDiaryRepository();
  const recipes = recipesThatFind(recipeFound);
  return {
    repo,
    recipes,
    add: new AddFoodLogEntryUseCase(repo, recipes),
    update: new UpdateFoodLogEntryUseCase(repo),
    remove: new DeleteFoodLogEntryUseCase(repo),
    day: new GetDiaryDayUseCase(repo),
    month: new GetDiaryMonthUseCase(repo),
    recent: new ListRecentFoodsUseCase(repo),
    water: new SetDayWaterUseCase(repo),
    getGoals: new GetNutritionGoalsUseCase(repo),
    setGoals: new SetNutritionGoalsUseCase(repo),
  };
};

const food = (overrides: Partial<Parameters<AddFoodLogEntryUseCase['execute']>[0]> = {}) => ({
  userId: ME,
  date: '2026-09-30',
  meal: MealSlot.Lunch,
  name: 'Menemen',
  servings: 2,
  nutrients: { calories: 600, protein: 30, carbs: 20, fat: 40, fiber: 4 },
  recipeId: null,
  ...overrides,
});

const addOk = async (s: ReturnType<typeof setup>, overrides: Parameters<typeof food>[0] = {}) => {
  const added = await s.add.execute(food(overrides));
  if (!added.ok) throw new Error(`fixture add failed: ${added.failure.messageKey}`);
  return added.value;
};

describe('AddFoodLogEntryUseCase', () => {
  it('stores the client snapshot as sent and returns the entry', async () => {
    const s = setup();
    const entry = await addOk(s);
    expect(entry).toMatchObject({
      date: '2026-09-30', meal: 'LUNCH', name: 'Menemen', servings: 2,
      calories: 600, protein: 30, carbs: 20, fat: 40, fiber: 4, recipeId: null, recipeImageUrl: null,
    });
  });

  it('checks a linked recipe is readable BY THIS USER', async () => {
    const s = setup();
    await addOk(s, { recipeId: 'r1' });
    expect(s.recipes.getById).toHaveBeenCalledWith('r1', ME);
  });

  it('answers not_found for a recipe the user cannot read, and logs nothing', async () => {
    const s = setup(false);
    const added = await s.add.execute(food({ recipeId: 'r-private' }));
    expect(!added.ok && added.failure.messageKey).toBe('errors.not_found.recipe');
    expect(s.repo.entries.size).toBe(0);
  });

  it('rejects an impossible date before touching anything', async () => {
    const s = setup();
    const added = await s.add.execute(food({ date: '2026-02-30' }));
    expect(!added.ok && added.failure.messageKey).toBe('errors.validation.date_invalid');
  });
});

describe('UpdateFoodLogEntryUseCase', () => {
  it('scales calories and macros with servings', async () => {
    const s = setup();
    const { id } = await addOk(s);
    const updated = await s.update.execute({ id, userId: ME, servings: 1 });
    expect(updated.ok && updated.value).toMatchObject({ servings: 1, calories: 300, protein: 15, carbs: 10, fat: 20, fiber: 2 });
  });

  it("answers not_found — not forbidden — for someone else's entry, and leaves it unchanged", async () => {
    const s = setup();
    const { id } = await addOk(s);
    const updated = await s.update.execute({ id, userId: THEM, servings: 5 });
    expect(!updated.ok && updated.failure).toBeInstanceOf(NotFoundFailure);
    expect(!updated.ok && updated.failure).not.toBeInstanceOf(ForbiddenFailure);
    expect(s.repo.entries.get(id)?.servings).toBe(2);
  });

  it('moves an entry to another day and meal', async () => {
    const s = setup();
    const { id } = await addOk(s);
    const updated = await s.update.execute({ id, userId: ME, date: '2026-10-01', meal: MealSlot.Dinner });
    expect(updated.ok && updated.value).toMatchObject({ date: '2026-10-01', meal: 'DINNER', calories: 600 });
  });
});

describe('DeleteFoodLogEntryUseCase', () => {
  it("only deletes the owner's entry", async () => {
    const s = setup();
    const { id } = await addOk(s);
    expect((await s.remove.execute({ id, userId: THEM })).ok).toBe(false);
    expect((await s.remove.execute({ id, userId: ME })).ok).toBe(true);
    expect(s.repo.entries.size).toBe(0);
  });
});

describe('GetDiaryDayUseCase', () => {
  it('answers an empty day with zero totals, no water and the default goals', async () => {
    const day = await setup().day.execute({ userId: ME, date: '2026-09-30' });
    expect(day.ok && day.value).toEqual({
      date: '2026-09-30',
      entries: [],
      waterGlasses: 0,
      totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      goals: DEFAULT_GOALS,
    });
  });

  it("totals only this user's entries for that day, meal order first", async () => {
    const s = setup();
    await addOk(s, { meal: MealSlot.Dinner, name: 'Soup', nutrients: { calories: 200, protein: 5.5, carbs: 10, fat: 3, fiber: null } });
    await addOk(s, { meal: MealSlot.Breakfast, name: 'Egg' });
    await addOk(s, { userId: THEM });
    await addOk(s, { date: '2026-10-01' });
    await s.water.execute({ userId: ME, date: '2026-09-30', glasses: 5 });

    const day = await s.day.execute({ userId: ME, date: '2026-09-30' });
    if (!day.ok) throw new Error('unreachable');
    expect(day.value.entries.map((e) => e.name)).toEqual(['Egg', 'Soup']);
    expect(day.value.totals).toEqual({ calories: 800, protein: 35.5, carbs: 30, fat: 43, fiber: 4 });
    expect(day.value.waterGlasses).toBe(5);
  });
});

describe('GetDiaryMonthUseCase', () => {
  it('lists only the days with entries, with their counts', async () => {
    const s = setup();
    await addOk(s, { date: '2026-09-01' });
    await addOk(s, { date: '2026-09-01' });
    await addOk(s, { date: '2026-10-01' });
    const month = await s.month.execute({ userId: ME, month: '2026-09' });
    expect(month.ok && month.value).toEqual({
      month: '2026-09',
      days: [{ date: '2026-09-01', calories: 1200, protein: 60, carbs: 40, fat: 80, entryCount: 2 }],
      goals: DEFAULT_GOALS,
    });
  });

  it('rejects a malformed month', async () => {
    const month = await setup().month.execute({ userId: ME, month: '2026-9' });
    expect(!month.ok && month.failure.messageKey).toBe('errors.validation.month_invalid');
  });
});

describe('ListRecentFoodsUseCase', () => {
  it('returns each distinct food once, newest first, normalised to one serving', async () => {
    const s = setup();
    // Three log times a millisecond apart, so "newest" is not a tie.
    jest.useFakeTimers({ now: 1_000 });
    try {
      await addOk(s, { name: 'Menemen', servings: 2 });
      jest.setSystemTime(2_000);
      await addOk(s, { name: 'menemen', servings: 4, nutrients: { calories: 1000, protein: 40, carbs: 20, fat: 60, fiber: null } });
      jest.setSystemTime(3_000);
      await addOk(s, { name: 'Menemen', recipeId: 'r1' });
    } finally {
      jest.useRealTimers();
    }

    const recent = await s.recent.execute({ userId: ME, limit: 20 });
    expect(recent.ok && recent.value).toEqual([
      { name: 'Menemen', servings: 1, calories: 300, protein: 15, carbs: 10, fat: 20, fiber: 2, recipeId: 'r1', recipeImageUrl: 'https://img.test/r1.jpg' },
      { name: 'menemen', servings: 1, calories: 250, protein: 10, carbs: 5, fat: 15, fiber: null, recipeId: null, recipeImageUrl: null },
    ]);
  });
});

describe('SetDayWaterUseCase', () => {
  it.each([-1, 31, 2.5])('refuses %p glasses', async (glasses) => {
    const set = await setup().water.execute({ userId: ME, date: '2026-09-30', glasses });
    expect(!set.ok && set.failure.messageKey).toBe('errors.validation.water_invalid');
  });

  it('replaces the day total', async () => {
    const s = setup();
    await s.water.execute({ userId: ME, date: '2026-09-30', glasses: 3 });
    const set = await s.water.execute({ userId: ME, date: '2026-09-30', glasses: 0 });
    expect(set.ok && set.value).toEqual({ date: '2026-09-30', waterGlasses: 0 });
  });
});

describe('nutrition goals', () => {
  it('answers the defaults until the user saves their own', async () => {
    const s = setup();
    expect(await s.getGoals.execute(ME)).toEqual(ok(DEFAULT_GOALS));
    const mine = { calories: 1800, protein: 120, carbs: 180, fat: 60, waterGlasses: 10 };
    await s.setGoals.execute({ userId: ME, goals: mine });
    expect(await s.getGoals.execute(ME)).toEqual(ok(mine));
  });

  it.each([
    ['calories', { ...DEFAULT_GOALS, calories: 700 }],
    ['calories', { ...DEFAULT_GOALS, calories: 6001 }],
    ['fat', { ...DEFAULT_GOALS, fat: 601 }],
    ['waterGlasses', { ...DEFAULT_GOALS, waterGlasses: 0 }],
  ])('refuses an out-of-range %s', async (field, goals) => {
    const set = await setup().setGoals.execute({ userId: ME, goals });
    expect(!set.ok && [set.failure.messageKey, (set.failure as { field?: string }).field]).toEqual(['errors.validation.goal_invalid', field]);
  });
});
