import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/**
 * The per-user, per-day count of meal parses — the cost cap on the AI call.
 *
 * @remarks
 * - **Consume, then compare.** `consume` adds one and answers the new count in
 *   one atomic write, so two parses sent at once cannot both read 19 and both
 *   pass a cap of 20. A refused attempt still counts; it costs nothing more.
 * - **Refund when we failed, not the user.** A parse our side could not answer
 *   (provider down, moderation unreachable) gives the attempt back.
 * - **Days are UTC**, as for the assistant allowance.
 */
export interface MealParseUsageRepositoryInterface {
  consume(userId: string, day: Date): Promise<Result<number, Failure>>;
  refund(userId: string, day: Date): Promise<void>;
}
