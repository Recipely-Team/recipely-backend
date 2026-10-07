import { fail, ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { DmRule } from '@domain/instagram/dm-rule';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';

/**
 * Runs a rule's DM text and public reply through the content filter before it
 * is saved — Recipely posts and sends both in its own name, to strangers.
 */
export function moderateRuleText(moderator: ContentModeratorInterface, rule: DmRule): Result<DmRule, Failure> {
  const texts = [rule.dmText, ...(rule.publicReplyText !== null ? [rule.publicReplyText] : [])];
  for (const text of texts) {
    const verdict = moderator.moderate({ text, context: 'general' });
    if (verdict.status === ModerationStatus.Rejected) return fail(contentBlockedFailure(verdict.hit));
  }
  return ok(rule);
}
