import type { ModerationTermSet } from '@infrastructure/moderation/data/moderation-term-set';

// Recipe-only: a submitted recipe naming these as an "ingredient" is a safety
// hazard, not just a moderation call. Never checked outside recipe fields
// (appliesTo: 'recipe'), so this never touches comments or profiles.
export const DANGEROUS_SUBSTANCES: ModerationTermSet = {
  category: 'dangerous_substance',
  appliesTo: 'recipe',
  terms: [
    // "civa" (mercury) as a substring would flag "civata" (bolt/screw).
    { term: 'civa', matchType: 'word' },

    { term: 'zehir', matchType: 'substring' },
    { term: 'farezehri', matchType: 'substring' },
    { term: 'camasirsuyu', matchType: 'substring' },
    { term: 'antifriz', matchType: 'substring' },
    { term: 'tiner', matchType: 'substring' },
    { term: 'deterjan', matchType: 'substring' },
    { term: 'arsenik', matchType: 'substring' },
    { term: 'siyanur', matchType: 'substring' },
    { term: 'kezzap', matchType: 'substring' },
    { term: 'tuzruhu', matchType: 'substring' },
    { term: 'naftalin', matchType: 'substring' },
    { term: 'bogmaotu', matchType: 'substring' },
  ],
};
