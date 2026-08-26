import { ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { IAssistantUsageRepository } from '@domain/assistant/i-assistant-usage-repository';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import { isAdminRole } from '@domain/auth/user-role';
import { startOfUtcDay } from '@application/assistant/start-of-utc-day';
import { UNLIMITED_BUDGET_SECONDS } from '@application/assistant/unlimited-budget';

export interface RecordAssistantUsageInput {
  readonly userId: string;
  readonly seconds: number;
}

export interface RecordAssistantUsageResult {
  readonly budgetRemainingSec: number;
  readonly unlimited?: boolean;
}

/**
 * Charges the seconds a live session has spent since the last heartbeat.
 *
 * @remarks
 * - **The heartbeat is what makes the budget real.** A session's cost is not
 *   known until it ends, and it may never end cleanly — the app is killed, the
 *   phone loses signal. Charging as it goes means a session that vanishes has
 *   already paid for what it used.
 * - **It is a delta, not a total.** A client reporting cumulative seconds would
 *   have to be trusted to remember them across a reconnect, and any client that
 *   forgot would silently refund itself.
 * - **Each report is capped.** The number comes from a device, so a client that
 *   sends a year of seconds must not be able to lock its own account out; the
 *   cap is generous enough that no honest client reaches it, since a heartbeat
 *   that misses its interval simply reports a longer gap.
 * - **The answer is how much is left**, so a client that has run out learns it
 *   from the same call it was already making, rather than by being refused the
 *   next time it asks to speak.
 * - **An admin is charged but never runs down.** The seconds still land in the
 *   ledger, because the global total is read from the same rows and an
 *   unrecorded session would make the shared key look quieter than it is — but
 *   the answer is the unmetered floor, so the countdown that ends a session on
 *   the client never reaches it. Mirrors the mint: a session admitted without a
 *   limit must not be closed by one fifteen seconds later.
 */
const MAX_SECONDS_PER_REPORT = 120;

export class RecordAssistantUsageUseCase {
  constructor(
    private readonly usage: IAssistantUsageRepository,
    private readonly userDailySeconds: number,
    private readonly auth: IAuthRepository,
  ) {}

  async execute(
    input: RecordAssistantUsageInput,
  ): Promise<Result<RecordAssistantUsageResult, Failure>> {
    if (!Number.isFinite(input.seconds) || input.seconds < 0) {
      return { ok: false, failure: new ValidationFailure('errors.validation.seconds_invalid', 'seconds') };
    }

    const role = await this.auth.findRoleById(input.userId);
    if (!role.ok) return role;
    const unlimited = isAdminRole(role.value);

    const seconds = Math.min(Math.round(input.seconds), MAX_SECONDS_PER_REPORT);
    const charged = await this.usage.charge(input.userId, startOfUtcDay(new Date()), seconds, false);
    if (!charged.ok) return charged;

    if (unlimited) {
      return ok({ budgetRemainingSec: UNLIMITED_BUDGET_SECONDS, unlimited: true });
    }

    return ok({
      budgetRemainingSec: Math.max(0, this.userDailySeconds - charged.value.userSeconds),
    });
  }
}
