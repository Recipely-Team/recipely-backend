import { MealPlanRange } from '@domain/meal-plan/meal-plan-range';
import { CalendarDate } from '@domain/diary/calendar-date';

describe('MealPlanRange', () => {
  it('is inclusive and holds at most 14 days', () => {
    expect(MealPlanRange.create('2026-10-12', '2026-10-12').ok).toBe(true);
    expect(MealPlanRange.create('2026-10-12', '2026-10-25').ok).toBe(true);
    const tooLong = MealPlanRange.create('2026-10-12', '2026-10-26');
    expect(!tooLong.ok && tooLong.failure.messageKey).toBe('errors.validation.meal_plan_range_invalid');
    expect(MealPlanRange.create('2026-10-12', '2026-10-11').ok).toBe(false);
    const notADay = MealPlanRange.create('2026-02-30', '2026-03-01');
    expect(!notADay.ok && notADay.failure.messageKey).toBe('errors.validation.date_invalid');
  });

  it('makes a week from any weekday, across a month end', () => {
    const week = MealPlanRange.week('2026-10-29');
    expect(week.ok && [week.value.from.toString(), week.value.to.toString()]).toEqual(['2026-10-29', '2026-11-04']);
  });
});

describe('CalendarDate day arithmetic', () => {
  it('adds days across a DST change and a leap day without drifting', () => {
    const parsed = CalendarDate.parse('2028-02-28');
    if (!parsed.ok) throw new Error('fixture');
    expect(parsed.value.plusDays(1).toString()).toBe('2028-02-29');
    expect(parsed.value.plusDays(-31).toString()).toBe('2028-01-28');
    const march = CalendarDate.parse('2026-03-29');
    if (!march.ok) throw new Error('fixture');
    expect(march.value.daysUntil(march.value.plusDays(7))).toBe(7);
  });
});
