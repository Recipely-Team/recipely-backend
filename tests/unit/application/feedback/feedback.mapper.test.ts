import { Feedback, type FeedbackProps } from '@domain/feedback/feedback';
import { FeedbackCategory } from '@domain/feedback/feedback-category';
import { FeedbackStatus } from '@domain/feedback/feedback-status';
import { FeedbackMapper } from '@application/feedback/mappers/feedback.mapper';

function makeFeedback(overrides: Partial<FeedbackProps> = {}): Feedback {
  const result = Feedback.create({
    id: 'feedback-7',
    userId: 'user-9',
    category: FeedbackCategory.Suggestion,
    message: 'Add a dark mode',
    status: FeedbackStatus.New,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T12:00:00Z'),
    ...overrides,
  });
  if (!result.ok) throw new Error('Test setup failed: ' + result.failure.messageKey);
  return result.value;
}

describe('FeedbackMapper.toDto', () => {
  it('copies the core fields directly', () => {
    const dto = FeedbackMapper.toDto(makeFeedback());

    expect(dto.id).toBe('feedback-7');
    expect(dto.userId).toBe('user-9');
    expect(dto.category).toBe('suggestion');
    expect(dto.message).toBe('Add a dark mode');
    expect(dto.status).toBe('new');
  });

  it('maps absent optionals (subject, rating, contactEmail) to null', () => {
    const dto = FeedbackMapper.toDto(makeFeedback());

    expect(dto.subject).toBeNull();
    expect(dto.rating).toBeNull();
    expect(dto.contactEmail).toBeNull();
  });

  it('preserves present optionals', () => {
    const dto = FeedbackMapper.toDto(
      makeFeedback({ subject: 'UX', rating: 5, contactEmail: 'a@b.com' }),
    );

    expect(dto.subject).toBe('UX');
    expect(dto.rating).toBe(5);
    expect(dto.contactEmail).toBe('a@b.com');
  });

  it('converts dates to ISO strings', () => {
    const dto = FeedbackMapper.toDto(makeFeedback());

    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-01-02T12:00:00.000Z');
  });
});
