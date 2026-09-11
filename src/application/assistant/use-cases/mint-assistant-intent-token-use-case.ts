import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IntentTokenSignerInterface } from '@application/assistant/ports/intent-token-signer-interface';
import type { AssistantIntentTokenDto } from '@application/assistant/dtos/assistant-intent-token.dto';

export interface MintAssistantIntentTokenInput {
  readonly userId: string;
  readonly email: string;
}

/**
 * Issues the narrow token the phone's own assistant carries.
 *
 * @remarks
 * - **No budget check here, deliberately.** The token buys the typed turn, and
 *   that turn is metered where every other caller is metered — the AI rate limit
 *   on the route. Checking an allowance at mint time would answer the wrong
 *   question: a token minted this morning says nothing about what is left when
 *   Siri is asked something three weeks from now.
 * - **Nor an account check.** The route's auth middleware already proved the
 *   session and that the account is not a tombstone; repeating it here would
 *   read the same row twice and invite the two answers to disagree.
 * - **The expiry is computed from the signer's own lifetime**, so the date the
 *   client is told and the date inside the token cannot drift apart.
 */
export class MintAssistantIntentTokenUseCase {
  constructor(private readonly tokens: IntentTokenSignerInterface) {}

  async execute(input: MintAssistantIntentTokenInput): Promise<Result<AssistantIntentTokenDto, Failure>> {
    const token = await this.tokens.sign({ sub: input.userId, email: input.email });
    const expiresAt = new Date(Date.now() + this.tokens.lifetimeSeconds * 1000).toISOString();

    return ok({ token, expiresAt });
  }
}
