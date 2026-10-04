import { CalendarDate } from '@domain/diary/calendar-date';
import { CalendarMonth } from '@domain/diary/calendar-month';
import { FoodLogEntry } from '@domain/diary/food-log-entry';
import { MealSlot } from '@domain/diary/meal-slot';
import { Nutrients } from '@domain/diary/nutrients';

const nutrients = (calories: number, protein: number, fiber: number | null = 2): Nutrients => {
  const made = Nutrients.create({ calories, protein, carbs: 30, fat: 10, fiber });
  if (!made.ok) throw new Error('fixture nutrients invalid');
  return made.value;
};

const entry = (servings: number, n: Nutrients): FoodLogEntry => {
  const date = CalendarDate.parse('2026-09-30');
  if (!date.ok) throw new Error('fixture date invalid');
  const made = FoodLogEntry.create({
    id: 'e1', userId: 'u1', date: date.value, meal: MealSlot.Lunch, name: '  Menemen ', servings, nutrients: n,
    recipeId: null, createdAt: new Date(0), updatedAt: new Date(0),
  });
  if (!made.ok) throw new Error('fixture entry invalid');
  return made.value;
};

describe('CalendarDate', () => {
  it('keeps a real calendar day as written', () => {
    const parsed = CalendarDate.parse('2028-02-29');
    expect(parsed.ok && parsed.value.toString()).toBe('2028-02-29');
  });

  it.each(['2026-02-30', '2026-13-01', '2026-9-1', '30.09.2026', '2026-09-30T00:00:00Z', ''])(
    'rejects %p with the date key — Postgres would otherwise answer a 500',
    (value) => {
      const parsed = CalendarDate.parse(value);
      expect(!parsed.ok && parsed.failure.messageKey).toBe('errors.validation.date_invalid');
    },
  );

  it('round-trips through the UTC-midnight Date Prisma uses for a DATE column', () => {
    const parsed = CalendarDate.parse('2026-12-31');
    if (!parsed.ok) throw new Error('unreachable');
    expect(CalendarDate.fromDate(parsed.value.toDate()).toString()).toBe('2026-12-31');
  });
});

describe('CalendarMonth', () => {
  it.each([
    ['2026-02', '2026-02-01', '2026-02-28'],
    ['2028-02', '2028-02-01', '2028-02-29'],
    ['2026-12', '2026-12-01', '2026-12-31'],
  ])('%s spans %s..%s', (value, first, last) => {
    const parsed = CalendarMonth.parse(value);
    if (!parsed.ok) throw new Error('unreachable');
    expect([parsed.value.firstDay.toString(), parsed.value.lastDay.toString()]).toEqual([first, last]);
  });

  it.each(['2026-13', '2026-00', '2026-9', '2026-09-01'])('rejects %p', (value) => {
    const parsed = CalendarMonth.parse(value);
    expect(!parsed.ok && parsed.failure.messageKey).toBe('errors.validation.month_invalid');
  });
});

describe('Nutrients', () => {
  it('rounds kcal to a whole number and grams to one decimal on the way in', () => {
    expect(nutrients(412.6, 12.345).values).toEqual({ calories: 413, protein: 12.3, carbs: 30, fat: 10, fiber: 2 });
  });

  it('keeps unknown macros null through scaling and skips them in a sum', () => {
    const made = Nutrients.create({ calories: 300, protein: null, carbs: 20, fat: null, fiber: null });
    if (!made.ok) throw new Error('unreachable');
    expect(made.value.scale(0.5).values).toEqual({ calories: 150, protein: null, carbs: 10, fat: null, fiber: null });
    expect(made.value.plus(Nutrients.zero()).values).toEqual({ calories: 300, protein: 0, carbs: 20, fat: 0, fiber: 0 });
  });

  it('refuses a negative value, naming the field', () => {
    const made = Nutrients.create({ calories: 100, protein: -1, carbs: 0, fat: 0, fiber: null });
    expect(!made.ok && made.failure.field).toBe('protein');
  });

  it('keeps an unknown fiber unknown when scaled, but counts it as none in a sum', () => {
    const noFiber = nutrients(100, 10, null);
    expect(noFiber.scale(2).values.fiber).toBeNull();
    expect(noFiber.plus(nutrients(100, 10, 3)).values.fiber).toBe(3);
  });
});

describe('FoodLogEntry', () => {
  it('trims the name', () => {
    expect(entry(1, nutrients(100, 10)).name).toBe('Menemen');
  });

  it('rescales stored totals proportionally when servings change', () => {
    const changed = entry(2, nutrients(600, 30, 4)).apply({ servings: 3 }, new Date(1));
    if (!changed.ok) throw new Error('unreachable');
    expect(changed.value.servings).toBe(3);
    expect(changed.value.nutrients.values).toEqual({ calories: 900, protein: 45, carbs: 45, fat: 15, fiber: 6 });
  });

  it('leaves the totals alone when only the meal or day moves', () => {
    const original = entry(2, nutrients(600, 30));
    const moved = original.apply({ meal: MealSlot.Dinner }, new Date(1));
    expect(moved.ok && moved.value.nutrients).toBe(original.nutrients);
  });

  it.each([0, -1, 0.25, 1.3, 20.5])('refuses %p servings', (servings) => {
    const changed = entry(1, nutrients(100, 10)).apply({ servings }, new Date(1));
    expect(!changed.ok && changed.failure.messageKey).toBe('errors.validation.servings_invalid');
  });

  it('sizes itself to one serving', () => {
    expect(entry(4, nutrients(800, 40, 8)).perServing().values).toEqual({
      calories: 200, protein: 10, carbs: 7.5, fat: 2.5, fiber: 2,
    });
  });
});
