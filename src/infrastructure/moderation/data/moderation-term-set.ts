import type { ModerationHit } from '@application/moderation/ports/content-moderator-interface';
import type { ModerationTerm } from '@infrastructure/moderation/data/moderation-term';

export interface ModerationTermSet {
  readonly category: ModerationHit['category'];
  readonly appliesTo: 'all' | 'recipe';
  readonly terms: readonly ModerationTerm[];
}
