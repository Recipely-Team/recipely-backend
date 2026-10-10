import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/**
 * The per-user, per-day count of fridge calls — scans and idea requests share
 * one allowance, the cost cap on their model calls.
 *
 * @remarks
 * - **Consume, then compare.** `consume` adds one and answers the new count in
 *   one atomic write, so two calls sent at once cannot both pass the cap.
 * - **Refund when we failed, not the user.** A call our side could not answer
 *   (provider down, moderation unreachable, a photo we could not decode)
 *   gives the attempt back.
 * - **Days are UTC**, as for the meal parse and the assistant allowance.
 */
export interface FridgeUsageRepositoryInterface {
  consume(userId: string, day: Date): Promise<Result<number, Failure>>;
  refund(userId: string, day: Date): Promise<void>;
}
