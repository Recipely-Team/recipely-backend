import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A calendar month, `YYYY-MM`, and the first and last day it spans. */
export class CalendarMonth {
  private constructor(
    private readonly iso: string,
    readonly firstDay: CalendarDate,
    readonly lastDay: CalendarDate,
  ) {}

  static parse(value: string): Result<CalendarMonth, ValidationFailure> {
    const match = MONTH_PATTERN.exec(value);
    if (!match) return fail(new ValidationFailure('errors.validation.month_invalid', 'month'));
    const year = Number(match[1]);
    const month = Number(match[2]);
    // Day 0 of the next month is the last day of this one, leap years included.
    const last = new Date(Date.UTC(year, month, 0));
    return ok(
      new CalendarMonth(value, CalendarDate.fromDate(new Date(Date.UTC(year, month - 1, 1))), CalendarDate.fromDate(last)),
    );
  }

  toString(): string {
    return this.iso;
  }
}
