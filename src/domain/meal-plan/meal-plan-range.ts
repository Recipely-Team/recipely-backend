import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';

const RANGE_INVALID = 'errors.validation.meal_plan_range_invalid';

/**
 * An inclusive run of client calendar days the planner reads, clears or copies.
 *
 * @remarks
 * - **Inclusive both ends**: `from == to` is one day.
 * - **At most {@link MealPlanLimits.RangeDaysMax} days**, and `from` never
 *   after `to` — `errors.validation.meal_plan_range_invalid` otherwise.
 */
export class MealPlanRange {
  private constructor(
    readonly from: CalendarDate,
    readonly to: CalendarDate,
  ) {}

  static create(from: string, to: string): Result<MealPlanRange, ValidationFailure> {
    const start = CalendarDate.parse(from);
    if (!start.ok) return start;
    const end = CalendarDate.parse(to);
    if (!end.ok) return end;
    const span = start.value.daysUntil(end.value);
    if (span < 0 || span >= MealPlanLimits.RangeDaysMax) return fail(new ValidationFailure(RANGE_INVALID, 'to'));
    return ok(new MealPlanRange(start.value, end.value));
  }

  /** The seven days starting at `start` — any weekday, not only a Monday. */
  static week(start: string): Result<MealPlanRange, ValidationFailure> {
    const first = CalendarDate.parse(start);
    if (!first.ok) return first;
    return ok(new MealPlanRange(first.value, first.value.plusDays(MealPlanLimits.CopyDays - 1)));
  }

  /** A single day. */
  static day(date: CalendarDate): MealPlanRange {
    return new MealPlanRange(date, date);
  }
}
