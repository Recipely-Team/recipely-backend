import { CalendarDate } from '@domain/diary/calendar-date';
import { MealSlot } from '@domain/diary/meal-slot';
import { RecipeCategory } from '@domain/recipes/recipe-category';
import { draftWeek } from '@domain/meal-plan/week-draft/draft-week';
import { slotFit } from '@domain/meal-plan/week-draft/slot-fit';

/**
 * Meal planners are criticised for "the same five recipes". The week drafter
 * never repeats one inside a week, keeps last fortnight's recipes for last,
 * and avoids the same kind of dish two days running.
 */
const day = (n: number) => {
  const d = CalendarDate.parse('2026-10-12');
  if (!d.ok) throw new Error('date');
  return d.value.plusDays(n);
};
const dinners = (n: number) => Array.from({ length: n }, (_, i) => ({ date: day(i), meal: MealSlot.Dinner }));
const c = (id: string, category: RecipeCategory = RecipeCategory.MainCourse) => ({ id, category });

describe('draftWeek', () => {
  it('never uses a recipe twice in a week, picks and swaps together', () => {
    const pool = Array.from({ length: 20 }, (_, i) => c(`r${i}`));
    const week = draftWeek({ candidates: pool, recentIds: new Set(), slots: dinners(7), seed: 1 });
    const ids = week.flatMap((s) => [s.pickId, s.alternativeId]).filter((x): x is string => x !== null);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(14);
  });

  it('keeps recently planned recipes for when nothing fresh fits', () => {
    const week = draftWeek({ candidates: [c('old'), c('new')], recentIds: new Set(['old']), slots: dinners(1), seed: 3 });
    expect(week[0]).toMatchObject({ pickId: 'new', alternativeId: 'old' });
  });

  it('leaves a meal empty rather than repeating when the pool runs out', () => {
    const week = draftWeek({ candidates: [c('a')], recentIds: new Set(), slots: dinners(2), seed: 1 });
    expect(week.map((s) => s.pickId)).toEqual(['a', null]);
  });

  it('passes over the same kind of dish two days running while something else fits', () => {
    const pool = [c('soup1', RecipeCategory.Soup), c('soup2', RecipeCategory.Soup), c('pasta', RecipeCategory.Pasta), c('curry', RecipeCategory.Curry)];
    const week = draftWeek({ candidates: pool, recentIds: new Set(), slots: dinners(2), seed: 9 });
    const first = pool.find((p) => p.id === week[0]?.pickId)?.category;
    const second = pool.find((p) => p.id === week[1]?.pickId)?.category;
    expect(first).not.toBe(second);
  });

  it('is the same week for the same seed, and a reshuffle can differ', () => {
    const pool = Array.from({ length: 30 }, (_, i) => c(`r${i}`));
    const a = draftWeek({ candidates: pool, recentIds: new Set(), slots: dinners(7), seed: 42 });
    const b = draftWeek({ candidates: pool, recentIds: new Set(), slots: dinners(7), seed: 42 });
    const other = draftWeek({ candidates: pool, recentIds: new Set(), slots: dinners(7), seed: 43 });
    expect(a).toEqual(b);
    expect(other.map((s) => s.pickId)).not.toEqual(a.map((s) => s.pickId));
  });
});

describe('slotFit', () => {
  it('keeps a casserole off breakfast and a sauce off every meal', () => {
    expect(slotFit(MealSlot.Breakfast, RecipeCategory.Casserole)).toBe(0);
    expect(slotFit(MealSlot.Dinner, RecipeCategory.Sauce)).toBe(0);
    expect(slotFit(MealSlot.Breakfast, RecipeCategory.Breakfast)).toBe(2);
    expect(slotFit(MealSlot.Lunch, RecipeCategory.Soup)).toBe(2);
  });
});
