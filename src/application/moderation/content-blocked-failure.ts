import { ValidationFailure } from '@core/failure';
import type { ModerationHit } from '@application/moderation/ports/content-moderator-interface';

// Every dangerous_substance hit gets its own (recipe-specific) message; every
// other category shares the generic "inappropriate content" message.
export function contentBlockedFailure(hit: ModerationHit): ValidationFailure {
  const messageKey =
    hit.category === 'dangerous_substance' ? 'errors.validation.content_blocked_dangerous' : 'errors.validation.content_blocked';
  return new ValidationFailure(messageKey);
}
