import { Feedback, type FeedbackProps } from '@domain/feedback/feedback';
import { FeedbackCategory } from '@domain/feedback/feedback-category';
import { FeedbackStatus } from '@domain/feedback/feedback-status';

function makeProps(overrides: Partial<FeedbackProps> = {}): FeedbackProps {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'feedback-1',
    userId: 'user-1',
    category: FeedbackCategory.Bug,
    message: 'The save button does nothing',
    status: FeedbackStatus.New,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Feedback.create', () => {
  it('returns ok for a valid minimal feedback', () => {
    const result = Feedback.create(makeProps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBe('user-1');
    expect(result.value.category).toBe('bug');
    expect(result.value.message).toBe('The save button does nothing');
    expect(result.value.status).toBe('new');
    expect(result.value.subject).toBeUndefined();
    expect(result.value.rating).toBeUndefined();
    expect(result.value.contactEmail).toBeUndefined();
  });

  it('returns ok and preserves optional subject, rating and contactEmail', () => {
    const result = Feedback.create(
      makeProps({ subject: 'Save bug', rating: 4, contactEmail: 'me@example.com' }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subject).toBe('Save bug');
    expect(result.value.rating).toBe(4);
    expect(result.value.contactEmail).toBe('me@example.com');
  });

  it.each([1, 2, 3, 4, 5])('accepts rating %i', (rating) => {
    const result = Feedback.create(makeProps({ rating }));
    expect(result.ok).toBe(true);
  });

  describe('validation failures (never throws, returns ValidationFailure)', () => {
    it('fails when id is empty', () => {
      const result = Feedback.create(makeProps({ id: '   ' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });

    it('fails when userId is empty', () => {
      const result = Feedback.create(makeProps({ userId: '' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });

    it('fails when category is invalid', () => {
      const result = Feedback.create(makeProps({ category: 'complaint' as never }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });

    it('fails when message is empty', () => {
      const result = Feedback.create(makeProps({ message: '   ' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });

    it('fails when message exceeds 5000 chars', () => {
      const result = Feedback.create(makeProps({ message: 'a'.repeat(5001) }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });

    it('fails when subject exceeds 200 chars', () => {
      const result = Feedback.create(makeProps({ subject: 'a'.repeat(201) }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });

    it.each([0, 6, -1])('fails when rating is out of range (%i)', (rating) => {
      const result = Feedback.create(makeProps({ rating }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });

    it('fails when rating is not an integer', () => {
      const result = Feedback.create(makeProps({ rating: 3.5 }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.code).toBe('validation');
    });
  });
});
