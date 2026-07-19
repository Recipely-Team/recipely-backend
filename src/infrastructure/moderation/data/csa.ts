import type { ModerationTermSet } from '@infrastructure/moderation/data/types';

// Tightly scoped to terms that unambiguously reference child sexual abuse —
// no everyday words like "çocuk" (child) belong here.
export const CSA: ModerationTermSet = {
  category: 'csa',
  appliesTo: 'all',
  terms: [
    // Whole-token only: "pedo" as a substring would flag "torpedo".
    { term: 'pedo', matchType: 'word' },
    { term: 'csam', matchType: 'word' },
    { term: 'childporn', matchType: 'substring' },
    { term: 'pedophile', matchType: 'substring' },
    { term: 'pedofili', matchType: 'substring' },
    { term: 'cocukpornosu', matchType: 'substring' },
  ],
};
