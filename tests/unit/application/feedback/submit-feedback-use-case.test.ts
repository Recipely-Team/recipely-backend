import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import { Feedback } from '@domain/feedback/feedback';
import { FeedbackCategory } from '@domain/feedback/feedback-category';
import { FeedbackStatus } from '@domain/feedback/feedback-status';
import type { IFeedbackRepository } from '@domain/feedback/i-feedback-repository';
import {
  SubmitFeedbackUseCase,
  type SubmitFeedbackInput,
} from '@application/feedback/use-cases/submit-feedback-use-case';

function makeInput(overrides: Partial<SubmitFeedbackInput> = {}): SubmitFeedbackInput {
  return {
    userId: 'user-1',
    category: 'bug',
    message: 'Crashes on launch',
    contactEmail: 'user@example.com',
    ...overrides,
  };
}

function persistedFrom(input: SubmitFeedbackInput): Feedback {
  const now = new Date();
  const result = Feedback.create({
    id: 'feedback-1',
    userId: input.userId,
    category: input.category as FeedbackCategory,
    message: input.message,
    contactEmail: input.contactEmail,
    status: FeedbackStatus.New,
    createdAt: now,
    updatedAt: now,
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
  });
  if (!result.ok) throw new Error('Test setup failed');
  return result.value;
}

function makeRepo(create: IFeedbackRepository['create']): IFeedbackRepository {
  return { create };
}

describe('SubmitFeedbackUseCase', () => {
  it('persists feedback and returns a FeedbackDto on success', async () => {
    const input = makeInput({ subject: 'Crash', rating: 2 });
    const createMock = jest.fn().mockResolvedValue(ok(persistedFrom(input)));
    const useCase = new SubmitFeedbackUseCase(makeRepo(createMock));

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBe('user-1');
    expect(result.value.category).toBe('bug');
    expect(result.value.message).toBe('Crashes on launch');
    expect(createMock).toHaveBeenCalledTimes(1);

    // The entity passed to the repo carries the resolved props.
    const passed = createMock.mock.calls[0][0] as Feedback;
    expect(passed.userId).toBe('user-1');
    expect(passed.status).toBe(FeedbackStatus.New);
    expect(passed.subject).toBe('Crash');
    expect(passed.rating).toBe(2);
  });

  it('returns a ValidationFailure for an invalid category without touching the repo', async () => {
    const createMock = jest.fn();
    const useCase = new SubmitFeedbackUseCase(makeRepo(createMock));

    const result = await useCase.execute(makeInput({ category: 'complaint' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('propagates a repository failure', async () => {
    const createMock = jest.fn().mockResolvedValue(fail(new UnknownFailure('db down')));
    const useCase = new SubmitFeedbackUseCase(makeRepo(createMock));

    const result = await useCase.execute(makeInput());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
  });
});
