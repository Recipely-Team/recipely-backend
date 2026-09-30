import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_LENGTH = 10;

/**
 * A calendar day as the CLIENT sees it — `YYYY-MM-DD`, with no time and no zone.
 *
 * @remarks
 * - **Never a timestamp.** A dinner logged at 23:30 in Istanbul belongs to that
 *   day; turning it into an instant would move it to the next one for a server
 *   in UTC. Persisted as a Postgres `DATE`, which Prisma hands over as UTC
 *   midnight — `toDate` / `fromDate` are the only crossing points.
 * - **A real day, not just the right shape.** `2026-02-30` matches the pattern
 *   and is rejected: Postgres would refuse it and surface a 500.
 */
export class CalendarDate {
  private constructor(private readonly iso: string) {}

  static parse(value: string): Result<CalendarDate, ValidationFailure> {
    const match = DATE_PATTERN.exec(value);
    if (!match) return fail(new ValidationFailure('errors.validation.date_invalid', 'date'));
    const asDate = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(asDate.getTime()) || asDate.toISOString().slice(0, ISO_DATE_LENGTH) !== value) {
      return fail(new ValidationFailure('errors.validation.date_invalid', 'date'));
    }
    return ok(new CalendarDate(value));
  }

  static fromDate(date: Date): CalendarDate {
    return new CalendarDate(date.toISOString().slice(0, ISO_DATE_LENGTH));
  }

  toDate(): Date {
    return new Date(`${this.iso}T00:00:00.000Z`);
  }

  toString(): string {
    return this.iso;
  }
}
