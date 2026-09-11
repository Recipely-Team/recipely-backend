import type { NextFunction, Request, Response } from 'express';
import { ok, type Result } from '@core/result/result';
import { UnauthorizedFailure, type Failure } from '@core/failure';
import type { TokenPayload, TokenSignerInterface } from '@application/auth/ports/token-signer-interface';
import type { IntentTokenSignerInterface } from '@application/assistant/ports/intent-token-signer-interface';
import type { EnsureAccountActiveUseCase } from '@application/auth/use-cases/ensure-account-active-use-case';
import { failureToHttp } from '@presentation/http/failure-to-http';
import { AssistantCaller } from '@domain/assistant/assistant-caller';

/**
 * Tries the session signer, then the intent signer.
 *
 * The failure reported when both refuse is the SESSION's. Almost every request
 * that arrives here with a bad credential is an app whose session expired, and
 * answering that "not an assistant intent token" would send whoever reads the
 * log looking at the wrong half of the system.
 */
async function verifyEither(
  sessions: TokenSignerInterface,
  intents: IntentTokenSignerInterface,
  token: string,
): Promise<Result<{ payload: TokenPayload; caller: AssistantCaller }, Failure>> {
  const asSession = await sessions.verify(token);
  if (asSession.ok) return ok({ payload: asSession.value, caller: AssistantCaller.App });

  const asIntent = await intents.verify(token);
  return asIntent.ok ? ok({ payload: asIntent.value, caller: AssistantCaller.PhoneAssistant }) : asSession;
}

/**
 * Accepts either a session JWT or an assistant intent token, for the one route
 * that has to answer both the app and the phone's assistant.
 *
 * @remarks
 * - **Only the typed turn takes two credentials.** Minting a Live session spends
 *   Google quota against a daily budget and the heartbeat is what charges it;
 *   neither is something a token sitting in a container the OS assistant can
 *   read should reach. So this is mounted on `/message` alone — and
 *   `/intent-token` itself stays session-only, or a leaked intent token could
 *   renew itself forever and the narrow scope would be a formality.
 * - **Both doors lead through the tombstone check.** Account deletion tombstones
 *   the row rather than dropping it and both tokens are stateless, so a deleted
 *   user's Siri shortcut has to stop working too. Here is the only place that can
 *   be true for both credentials at once.
 * - **Which door it was names the caller.** Only the phone's assistant holds an
 *   intent token, so the token that passed decides how long the answer may take
 *   (`AssistantCaller`, `ASSISTANT_ANSWER_BUDGET_MS`).
 */
export function createAssistantMessageAuthMiddleware(
  sessions: TokenSignerInterface,
  intents: IntentTokenSignerInterface,
  ensureActive: EnsureAccountActiveUseCase,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      const { status, body } = failureToHttp(new UnauthorizedFailure('Missing bearer token'));
      res.status(status).json(body);
      return;
    }

    const verified = await verifyEither(sessions, intents, header.slice('Bearer '.length).trim());
    if (!verified.ok) {
      const { status, body } = failureToHttp(verified.failure);
      res.status(status).json(body);
      return;
    }

    const activeResult = await ensureActive.execute({ userId: verified.value.payload.sub });
    if (!activeResult.ok) {
      const { status, body } = failureToHttp(activeResult.failure);
      res.status(status).json(body);
      return;
    }

    req.user = { id: verified.value.payload.sub, email: verified.value.payload.email };
    req.assistantCaller = verified.value.caller;
    next();
  };
}
