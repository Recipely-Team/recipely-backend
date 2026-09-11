import { AssistantCaller } from '@domain/assistant/assistant-caller';
import type { Request, Response } from 'express';
import { ok, fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { AssistantSessionDto } from '@application/assistant/dtos/assistant-session.dto';
import type {
  AnswerAssistantMessageUseCase,
} from '@application/assistant/use-cases/answer-assistant-message-use-case';
import type { AssistantMessageReply } from '@application/assistant/ports/assistant-responder-interface';
import type { MintAssistantSessionUseCase } from '@application/assistant/use-cases/mint-assistant-session-use-case';
import type {
  RecordAssistantUsageResult,
  RecordAssistantUsageUseCase,
} from '@application/assistant/use-cases/record-assistant-usage-use-case';
import type { TranslationService } from '@application/i18n/translation-service';
import type { AssistantIntentTokenDto } from '@application/assistant/dtos/assistant-intent-token.dto';
import type { MintAssistantIntentTokenUseCase } from '@application/assistant/use-cases/mint-assistant-intent-token-use-case';
import { AssistantController } from '@presentation/controllers/assistant.controller';

function ts(): TranslationService {
  return { t: (key: string) => key, localeFromRequest: () => 'en' } as unknown as TranslationService;
}

function res() {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  } as unknown as Response;
  return { response, sent };
}

function req(body: unknown): Request {
  return { body, locale: 'tr', user: { id: 'u1', email: 'a@b.c' } } as unknown as Request;
}

function intentToken(
  result: Result<AssistantIntentTokenDto, Failure> = ok({ token: 'intent-token', expiresAt: '2026-10-10T12:00:00.000Z' }),
): MintAssistantIntentTokenUseCase {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as MintAssistantIntentTokenUseCase;
}

function mint(result: Result<AssistantSessionDto, Failure>): MintAssistantSessionUseCase {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as MintAssistantSessionUseCase;
}

function answer(
  result: Result<AssistantMessageReply, Failure>,
): AnswerAssistantMessageUseCase {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as AnswerAssistantMessageUseCase;
}

function heartbeat(
  result: Result<RecordAssistantUsageResult, Failure>,
): RecordAssistantUsageUseCase {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as RecordAssistantUsageUseCase;
}

describe('AssistantController', () => {
  describe('POST /assistant/session', () => {
    it('returns the credential the device opens the socket with', async () => {
      const dto: AssistantSessionDto = {
        token: 'auth_tokens/abc',
        model: 'models/live',
        wsUrl: 'wss://x',
        expiresAt: 'later',
        budgetRemainingSec: 480,
      };
      const { response, sent } = res();

      await new AssistantController(mint(ok(dto)), heartbeat(ok({ budgetRemainingSec: 0 })), answer(ok({ reply: '' })), ts(), intentToken()).session(
        req({ languageCode: 'tr-TR' }),
        response,
      );

      expect(sent.status).toBe(200);
      expect(sent.body).toEqual(dto);
    });

    // An exhausted allowance is the expected outcome several times a day and
    // the app answers it by offering the text mode. A 429 here would have been
    // rendered as an error dialog for something working as designed.
    it('answers 200 when the budget is gone, not an error status', async () => {
      const { response, sent } = res();

      await new AssistantController(
        mint(ok({ budgetRemainingSec: 0, reason: 'user_daily_limit' })),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        answer(ok({ reply: '' })),
        ts(),
        intentToken(),
      ).session(req({ languageCode: 'tr-TR' }), response);

      expect(sent.status).toBe(200);
      expect(sent.body).toEqual({ budgetRemainingSec: 0, reason: 'user_daily_limit' });
    });

    it('reports an upstream outage as a failure', async () => {
      const { response, sent } = res();

      await new AssistantController(
        mint(fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'))),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        answer(ok({ reply: '' })),
        ts(),
        intentToken(),
      ).session(req({ languageCode: 'tr-TR' }), response);

      expect(sent.status).toBe(503);
    });

    // The language code reaches Google's speech config inside a request signed
    // with our own API key, so it is validated rather than passed through.
    it('rejects a language code that is not one', async () => {
      const controller = new AssistantController(
        mint(ok({ budgetRemainingSec: 600 })),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        answer(ok({ reply: '' })),
        ts(),
        intentToken(),
      );

      await expect(controller.session(req({ languageCode: 'not a locale' }), res().response)).rejects.toThrow();
      await expect(controller.session(req({}), res().response)).rejects.toThrow();
    });
  });

  describe('POST /assistant/message', () => {
    // The mode that still works when voice cannot — out of budget, in a quiet
    // room, on a bad connection. It answers 200 with the reply and, when the
    // model chose one, the action for the app to perform.
    it('returns the reply and the chosen action', async () => {
      const { response, sent } = res();

      await new AssistantController(
        mint(ok({ budgetRemainingSec: 0 })),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        answer(ok({ reply: 'Açıyorum', action: { name: 'openRecipe', arg: 'mercimek' } })),
        ts(),
        intentToken(),
      ).message(req({ message: 'mercimek çorbasını aç', languageCode: 'tr-TR' }), response);

      expect(sent.status).toBe(200);
      expect(sent.body).toEqual({
        reply: 'Açıyorum',
        action: { name: 'openRecipe', arg: 'mercimek' },
      });
    });

    // The caller comes from the credential the middleware accepted, never from
    // the body — a body field would let the app claim the phone's budget.
    it('passes on who is waiting, and assumes the app when nobody said', async () => {
      const useCase = answer(ok({ reply: 'tamam' }));
      const controller = new AssistantController(
        mint(ok({ budgetRemainingSec: 0 })),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        useCase,
        ts(),
        intentToken(),
      );

      // The body claims the app's budget; the credential says otherwise, and wins.
      const fromPhone = { ...req({ message: 'merhaba', languageCode: 'tr-TR', caller: AssistantCaller.App }), assistantCaller: AssistantCaller.PhoneAssistant } as unknown as Request;
      await controller.message(fromPhone, res().response);
      await controller.message(req({ message: 'merhaba', languageCode: 'tr-TR' }), res().response);

      const execute = useCase.execute as jest.Mock;
      expect(execute.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ caller: AssistantCaller.PhoneAssistant }));
      expect(execute.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ caller: AssistantCaller.App }));
    });

    it('reports an upstream outage as a failure', async () => {
      const { response, sent } = res();

      await new AssistantController(
        mint(ok({ budgetRemainingSec: 0 })),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        answer(fail(new ServiceUnavailableFailure('errors.assistant.session_unavailable'))),
        ts(),
        intentToken(),
      ).message(req({ message: 'merhaba', languageCode: 'tr-TR' }), response);

      expect(sent.status).toBe(503);
    });

    it('rejects an empty message and a bad language code', async () => {
      const controller = new AssistantController(
        mint(ok({ budgetRemainingSec: 0 })),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        answer(ok({ reply: '' })),
        ts(),
        intentToken(),
      );

      await expect(controller.message(req({ message: '  ', languageCode: 'tr-TR' }), res().response)).rejects.toThrow();
      await expect(controller.message(req({ message: 'hi', languageCode: 'nope' }), res().response)).rejects.toThrow();
    });
  });

  describe('POST /assistant/heartbeat', () => {
    it('answers how many seconds are left', async () => {
      const { response, sent } = res();

      await new AssistantController(
        mint(ok({ budgetRemainingSec: 0 })),
        heartbeat(ok({ budgetRemainingSec: 415 })),
        answer(ok({ reply: '' })),
        ts(),
        intentToken(),
      ).heartbeat(req({ seconds: 15 }), response);

      expect(sent.status).toBe(200);
      expect(sent.body).toEqual({ budgetRemainingSec: 415 });
    });

    it('rejects a duration that was never one', async () => {
      const controller = new AssistantController(
        mint(ok({ budgetRemainingSec: 0 })),
        heartbeat(ok({ budgetRemainingSec: 0 })),
        answer(ok({ reply: '' })),
        ts(),
        intentToken(),
      );

      await expect(controller.heartbeat(req({ seconds: -1 }), res().response)).rejects.toThrow();
      await expect(controller.heartbeat(req({ seconds: 'ten' }), res().response)).rejects.toThrow();
    });
  });
});

describe('AssistantController.intentToken', () => {
  it('answers with the token and the instant it expires', async () => {
    const { response, sent } = res();
    const dto = { token: 'intent-token', expiresAt: '2026-10-10T12:00:00.000Z' };

    await new AssistantController(
      mint(ok({ budgetRemainingSec: 0 })),
      heartbeat(ok({ budgetRemainingSec: 0 })),
      answer(ok({ reply: '' })),
      ts(),
      intentToken(ok(dto)),
    ).intentToken(req({}), response);

    expect(sent.status).toBe(200);
    expect(sent.body).toEqual(dto);
  });

  // The identity comes from the session the middleware already proved; a body
  // here would be a way to ask for someone else's token.
  it('mints for the authenticated user, ignoring the body', async () => {
    const { response } = res();
    const useCase = intentToken();

    await new AssistantController(
      mint(ok({ budgetRemainingSec: 0 })),
      heartbeat(ok({ budgetRemainingSec: 0 })),
      answer(ok({ reply: '' })),
      ts(),
      useCase,
    ).intentToken({ ...req({ userId: 'someone-else' }) } as never, response);

    expect(useCase.execute).toHaveBeenCalledWith({ userId: 'u1', email: 'a@b.c' });
  });

  it('reports a signing failure as a failure', async () => {
    const { response, sent } = res();

    await new AssistantController(
      mint(ok({ budgetRemainingSec: 0 })),
      heartbeat(ok({ budgetRemainingSec: 0 })),
      answer(ok({ reply: '' })),
      ts(),
      intentToken(fail(new ServiceUnavailableFailure('errors.unknown'))),
    ).intentToken(req({}), response);

    expect(sent.status).toBeGreaterThanOrEqual(400);
  });
});
