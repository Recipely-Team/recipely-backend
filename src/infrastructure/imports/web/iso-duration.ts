const ISO_DURATION = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;

/**
 * Minutes in an ISO 8601 duration (`PT1H30M`, `P0DT0H20M`), or `null` when the
 * value is missing or is not one.
 *
 * Rounded to whole minutes, since that is what the recipe stores; a site that
 * writes `PT90S` gets 2, not 1.5.
 */
export const isoDurationMinutes = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const m = ISO_DURATION.exec(value.trim());
  if (m === null || value.trim().toUpperCase() === 'P' || value.trim().toUpperCase() === 'PT') return null;
  const [days, hours, minutes, seconds] = [m[1], m[2], m[3], m[4]].map((part) => Number(part ?? 0));
  return Math.round(
    days! * MINUTES_PER_DAY + hours! * MINUTES_PER_HOUR + minutes! + seconds! / SECONDS_PER_MINUTE,
  );
};
