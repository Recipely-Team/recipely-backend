/**
 * What an unmetered account is told it has left.
 *
 * `unlimited: true` is the field that actually means it, but the number has to
 * be a large positive one rather than a sentinel like `-1` or `Infinity`: every
 * client already shipped reads `budgetRemainingSec` alone and ends the session
 * the moment it is not above zero, and `Infinity` is not valid JSON. A day of
 * seconds is far past any real session and survives a whole day of heartbeats
 * being subtracted from it by an older build.
 */
export const UNLIMITED_BUDGET_SECONDS = 86_400;
