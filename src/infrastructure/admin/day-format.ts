/**
 * Renders a `@db.Date` bucket key as the day it is actually keyed on.
 *
 * @remarks
 * `AssistantUsage.day` is a Postgres `date` — no time of day exists in it.
 * Prisma returns midnight UTC, so anything that formats the value in the
 * viewer's zone is wrong in both directions: at a positive offset it invents a
 * time (Istanbul read every row as `03:00`, which is what surfaced this), and
 * at a negative one it moves the row to the PREVIOUS day, silently misfiling
 * an aggregate nobody would think to re-check.
 *
 * Taking the calendar part of the ISO string is therefore not a shortcut, it is
 * the only reading that holds in every zone. The value arrives as an ISO string
 * over the wire (AdminJS ships `record.params` as JSON), but a `Date` survives
 * when the same code runs before serialisation — hence both branches, and a
 * final parse so an unexpected shape degrades to a real date rather than to
 * `String(date).slice(0, 10)`, which would print `Sat Aug 2`.
 */
export function toIsoDay(raw: unknown): string {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? '' : raw.toISOString().slice(0, 10);
  }
  const text = String(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString().slice(0, 10);
}
