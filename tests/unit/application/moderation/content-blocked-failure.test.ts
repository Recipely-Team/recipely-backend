import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import type { ModerationHit } from '@application/moderation/ports/content-moderator-interface';

describe('contentBlockedFailure', () => {
  it.each<ModerationHit['category']>(['profanity', 'sexual', 'hate', 'csa'])(
    'maps %s to the generic blocked-content message',
    (category) => {
      const failure = contentBlockedFailure({ category, term: 'x' });
      expect(failure.code).toBe('validation');
      expect(failure.messageKey).toBe('errors.validation.content_blocked');
    },
  );

  it('maps dangerous_substance to the recipe-specific message', () => {
    const failure = contentBlockedFailure({ category: 'dangerous_substance', term: 'farezehri' });
    expect(failure.code).toBe('validation');
    expect(failure.messageKey).toBe('errors.validation.content_blocked_dangerous');
  });
});
