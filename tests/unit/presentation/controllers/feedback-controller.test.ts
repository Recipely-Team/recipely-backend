import type { Request, Response } from 'express';
import { ok, fail, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { SubmitFeedbackUseCase } from '@application/feedback/use-cases/submit-feedback-use-case';
import type { FeedbackDto } from '@application/feedback/dtos/feedback.dto';
import type { TranslationService } from '@application/i18n/translation-service';
import { FeedbackController } from '@presentation/controllers/feedback.controller';

function makeTranslationService(): TranslationService {
  return {
    t: (key: string) => key,
    localeFromRequest: () => 'en',
  } as unknown as TranslationService;
}

function makeUseCase(
  result: Result<FeedbackDto, Failure>,
): { useCase: SubmitFeedbackUseCase; execute: jest.Mock } {
  const execute = jest.fn().mockResolvedValue(result);
  return { useCase: { execute } as unknown as SubmitFeedbackUseCase, execute };
}

function makeReq(body: Record<string, unknown>, user?: { id: string; email: string }): Request {
  return { body, params: {}, query: {}, user, locale: 'en' } as unknown as Request;
}

function makeRes(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

const sampleDto: FeedbackDto = {
  id: 'feedback-1',
  userId: 'user-1',
  category: 'bug',
  subject: null,
  message: 'Broken',
  rating: null,
  contactEmail: 'user@example.com',
  status: 'new',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('FeedbackController.submit', () => {
  it('responds 201 with the created feedback DTO on success', async () => {
    const { useCase, execute } = makeUseCase(ok(sampleDto));
    const controller = new FeedbackController(useCase, makeTranslationService());
    const req = makeReq(
      { category: 'bug', message: 'Broken', contactEmail: 'me@x.com' },
      { id: 'user-1', email: 'user@example.com' },
    );
    const { res, status, json } = makeRes();

    await controller.submit(req, res);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(sampleDto);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', category: 'bug', contactEmail: 'me@x.com' }),
    );
  });

  it("falls back to the authenticated user's email when contactEmail is omitted", async () => {
    const { useCase, execute } = makeUseCase(ok(sampleDto));
    const controller = new FeedbackController(useCase, makeTranslationService());
    const req = makeReq(
      { category: 'help', message: 'Need help' },
      { id: 'user-1', email: 'user@example.com' },
    );
    const { res } = makeRes();

    await controller.submit(req, res);

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: 'user@example.com' }),
    );
  });

  it('maps a use-case failure through failureToHttp', async () => {
    const { useCase } = makeUseCase(fail(new UnknownFailure('boom')));
    const controller = new FeedbackController(useCase, makeTranslationService());
    const req = makeReq(
      { category: 'bug', message: 'Broken' },
      { id: 'user-1', email: 'user@example.com' },
    );
    const { res, status } = makeRes();

    await controller.submit(req, res);

    expect(status).toHaveBeenCalledWith(500);
  });

  it('throws a ZodError for an invalid body (handled upstream by errorHandler)', async () => {
    const { useCase } = makeUseCase(ok(sampleDto));
    const controller = new FeedbackController(useCase, makeTranslationService());
    const req = makeReq(
      { category: 'invalid-cat', message: '' },
      { id: 'user-1', email: 'user@example.com' },
    );
    const { res } = makeRes();

    await expect(controller.submit(req, res)).rejects.toThrow();
  });
});
