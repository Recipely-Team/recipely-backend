import { isFeedbackCategory, FeedbackCategory } from '@domain/feedback/feedback-category';

describe('isFeedbackCategory', () => {
  it('returns true for every value in the FeedbackCategory const object', () => {
    Object.values(FeedbackCategory).forEach((v) => expect(isFeedbackCategory(v)).toBe(true));
  });

  it('returns false for an empty string', () => {
    expect(isFeedbackCategory('')).toBe(false);
  });

  it('returns false for an arbitrary string', () => {
    expect(isFeedbackCategory('complaint')).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(isFeedbackCategory(null)).toBe(false);
    expect(isFeedbackCategory(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isFeedbackCategory(1)).toBe(false);
  });
});
