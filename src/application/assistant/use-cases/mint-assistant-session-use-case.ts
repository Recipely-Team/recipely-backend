import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { AssistantSessionDto } from '@application/assistant/dtos/assistant-session.dto';
import type { IAssistantUsageRepository } from '@domain/assistant/i-assistant-usage-repository';
import type { ILiveSessionMinter } from '@application/assistant/ports/i-live-session-minter';
import { startOfUtcDay } from '@application/assistant/start-of-utc-day';

export interface MintAssistantSessionInput {
  readonly userId: string;
  readonly languageCode: string;
  readonly resumptionHandle?: string;
}

export interface MintAssistantSessionLimits {
  readonly userDailySeconds: number;
  readonly globalDailySeconds: number;
}

/**
 * Decides whether a voice session may start, and mints the credential if so.
 *
 * @remarks
 * - **Running out of budget is not a failure.** It is the expected answer
 *   several times a day, and the app's response is to offer the text mode — so
 *   it comes back as a successful result with no token, and the screen reads
 *   `budgetRemainingSec` and `reason`. Returned as a `Failure`, every refusal
 *   would have surfaced as an error dialog for something working as designed.
 * - **The budget is checked here and nowhere else.** The token the device holds
 *   is a bearer credential, so whatever the app believes, only this decision
 *   controls whether another one exists.
 * - **A session is counted at mint, not at its end.** A client that is killed
 *   mid-conversation never reports, and a budget that only charged completed
 *   sessions could be spent indefinitely by crashing.
 * - **Days are UTC.** The user's own midnight would need their timezone, which
 *   this endpoint does not have, and honouring a client-sent one would let an
 *   app reset its own allowance by lying about where it is.
 */
export class MintAssistantSessionUseCase {
  constructor(
    private readonly usage: IAssistantUsageRepository,
    private readonly minter: ILiveSessionMinter,
    private readonly limits: MintAssistantSessionLimits,
  ) {}

  async execute(input: MintAssistantSessionInput): Promise<Result<AssistantSessionDto, Failure>> {
    const day = startOfUtcDay(new Date());

    const today = await this.usage.readToday(input.userId, day);
    if (!today.ok) return today;

    const remaining = Math.max(0, this.limits.userDailySeconds - today.value.userSeconds);
    if (remaining === 0) {
      return ok({ budgetRemainingSec: 0, reason: 'user_daily_limit' });
    }
    if (today.value.globalSeconds >= this.limits.globalDailySeconds) {
      // Everybody shares one free-tier key, so one busy afternoon can close
      // voice for users who have not spent anything. They are told which limit
      // they hit, because "come back tomorrow" is wrong advice for one of them.
      return ok({ budgetRemainingSec: remaining, reason: 'global_daily_limit' });
    }

    const minted = await this.minter.mint({
      languageCode: input.languageCode,
      ...(input.resumptionHandle !== undefined ? { resumptionHandle: input.resumptionHandle } : {}),
    });
    if (!minted.ok) return minted;

    const charged = await this.usage.charge(input.userId, day, 0, true);
    if (!charged.ok) return charged;

    return ok({
      token: minted.value.token,
      model: minted.value.model,
      wsUrl: minted.value.wsUrl,
      expiresAt: minted.value.expiresAt,
      budgetRemainingSec: remaining,
    });
  }
}
