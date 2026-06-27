import { Prisma, type PrismaClient } from '@prisma/client';
import { Feedback } from '@domain/feedback/feedback';
import { FeedbackCategory } from '@domain/feedback/feedback-category';
import { FeedbackStatus } from '@domain/feedback/feedback-status';
import { PrismaFeedbackRepository } from '@infrastructure/repositories/feedback/prisma-feedback-repository';

function makeFeedback(): Feedback {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = Feedback.create({
    id: 'feedback-1',
    userId: 'user-1',
    category: FeedbackCategory.Bug,
    message: 'Broken',
    subject: 'Title',
    rating: 4,
    contactEmail: 'a@b.com',
    status: FeedbackStatus.New,
    createdAt: now,
    updatedAt: now,
  });
  if (!result.ok) throw new Error('Test setup failed');
  return result.value;
}

function makePrisma(create: jest.Mock): PrismaClient {
  return { feedback: { create } } as unknown as PrismaClient;
}

describe('PrismaFeedbackRepository.create', () => {
  it('persists and maps the created row back to a domain entity', async () => {
    const feedback = makeFeedback();
    const now = new Date('2026-01-01T00:00:00Z');
    const create = jest.fn().mockResolvedValue({
      id: 'feedback-1',
      userId: 'user-1',
      category: 'bug',
      subject: 'Title',
      message: 'Broken',
      rating: 4,
      contactEmail: 'a@b.com',
      status: 'new',
      createdAt: now,
      updatedAt: now,
    });
    const repo = new PrismaFeedbackRepository(makePrisma(create));

    const result = await repo.create(feedback);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe('feedback-1');
    expect(result.value.category).toBe('bug');
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.userId).toBe('user-1');
    expect(data.subject).toBe('Title');
    expect(data.rating).toBe(4);
  });

  it('maps a P2003 foreign-key violation to an UnauthorizedFailure (stale user → 401, not 500)', async () => {
    // feedbacks has a single FK (user_id → users.id), so P2003 means the
    // authenticated user no longer exists in the DB.
    const fkError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint violated on the constraint: `feedbacks_user_id_fkey`',
      { code: 'P2003', clientVersion: 'test' },
    );
    const create = jest.fn().mockRejectedValue(fkError);
    const repo = new PrismaFeedbackRepository(makePrisma(create));

    const result = await repo.create(makeFeedback());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unauthorized');
    expect(result.failure.messageKey).toBe('errors.unauthorized.user_not_found');
  });

  it('returns an UnknownFailure when Prisma throws (does not propagate the throw)', async () => {
    const create = jest.fn().mockRejectedValue(new Error('connection refused'));
    const repo = new PrismaFeedbackRepository(makePrisma(create));

    const result = await repo.create(makeFeedback());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unknown');
  });
});
