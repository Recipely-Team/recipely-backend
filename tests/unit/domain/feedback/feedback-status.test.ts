import { isFeedbackStatus, FeedbackStatus } from '@domain/feedback/feedback-status';

describe('isFeedbackStatus', () => {
  it('returns true for every value in the FeedbackStatus const object', () => {
    Object.values(FeedbackStatus).forEach((v) => expect(isFeedbackStatus(v)).toBe(true));
  });

  it('returns false for an empty string', () => {
    expect(isFeedbackStatus('')).toBe(false);
  });

  it('returns false for an arbitrary string', () => {
    expect(isFeedbackStatus('done')).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isFeedbackStatus(null)).toBe(false);
    expect(isFeedbackStatus(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isFeedbackStatus(0)).toBe(false);
  });
});
