import { isModerationStatus, ModerationStatus } from '@domain/recipes/moderation-status';

describe('isModerationStatus', () => {
  it('returns true for approved', () => {
    expect(isModerationStatus('approved')).toBe(true);
  });

  it('returns true for rejected', () => {
    expect(isModerationStatus('rejected')).toBe(true);
  });

  it('returns true for pending', () => {
    expect(isModerationStatus('pending')).toBe(true);
  });

  it('returns false for an empty string', () => {
    expect(isModerationStatus('')).toBe(false);
  });

  it('returns false for an arbitrary string', () => {
    expect(isModerationStatus('unknown')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isModerationStatus(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isModerationStatus(undefined)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isModerationStatus(1)).toBe(false);
  });

  it('covers every value in the ModerationStatus const object', () => {
    const allValues = Object.values(ModerationStatus);
    allValues.forEach(v => expect(isModerationStatus(v)).toBe(true));
  });
});
