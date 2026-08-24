/**
 * Midnight UTC on the day `at` falls in — the key of the usage ledger.
 *
 * UTC rather than the user's own midnight, because that would need their
 * timezone and the only place it could come from is the client. A day boundary
 * the app chooses is a day boundary the app can move, and moving it resets the
 * allowance. Prisma's `@db.Date` stores only the date part, so the time
 * component has to be zeroed or two writes on the same day can land on
 * different keys.
 */
export function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
