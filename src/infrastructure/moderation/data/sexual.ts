import type { ModerationTermSet } from '@infrastructure/moderation/data/moderation-term-set';

// Explicit sexual content / solicitation terms, distinct from the vulgar
// insults in profanity-*.ts. Deliberately excludes words like "naked"/"nude"
// — both are common baking terms ("naked cake") that would false-positive
// constantly in a recipe app.
export const SEXUAL: ModerationTermSet = {
  category: 'sexual',
  appliesTo: 'all',
  terms: [
    { term: 'seks', matchType: 'word' },
    { term: 'xxx', matchType: 'word' },
    { term: 'porno', matchType: 'substring' },
    { term: 'pornografi', matchType: 'substring' },
    { term: 'porn', matchType: 'substring' },
    { term: 'pornographic', matchType: 'substring' },
  ],
};
