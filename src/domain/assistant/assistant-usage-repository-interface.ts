import type { Failure } from '@core/failure';
import type { Result } from '@core/result/result';

export interface AssistantDailyUsage {
  readonly userSeconds: number;
  readonly globalSeconds: number;
}

/**
 * The voice budget's ledger.
 *
 * Two totals, because there are two ways to run out. A single user can spend
 * their own allowance; and every user together can exhaust the free tier, which
 * is one API key for the whole app — so a quiet user can find voice unavailable
 * through no fault of their own, and the app has to be able to tell them that
 * without pretending it is their limit.
 */
export interface AssistantUsageRepositoryInterface {
  /** Both totals for `day`, in one round trip. */
  readToday(userId: string, day: Date): Promise<Result<AssistantDailyUsage, Failure>>;

  /**
   * Adds `seconds` (and optionally one session) to the user's row for `day`,
   * creating it if this is their first use today.
   */
  charge(
    userId: string,
    day: Date,
    seconds: number,
    countsAsNewSession: boolean,
  ): Promise<Result<AssistantDailyUsage, Failure>>;
}
