import type { ModerationTermSet } from '@infrastructure/moderation/data/types';

export const HATE: ModerationTermSet = {
  category: 'hate',
  appliesTo: 'all',
  terms: [
    // Short/ambiguous roots — matched as a whole token only: "spic" as a
    // substring would flag "spice"/"spicy", both routine recipe words.
    { term: 'ibne', matchType: 'word' },
    { term: 'fag', matchType: 'word' },
    { term: 'retard', matchType: 'word' },
    { term: 'chink', matchType: 'word' },
    { term: 'spic', matchType: 'word' },
    { term: 'kike', matchType: 'word' },
    { term: 'gook', matchType: 'word' },

    { term: 'faggot', matchType: 'substring' },
    { term: 'nigger', matchType: 'substring' },
    { term: 'nigga', matchType: 'substring' },
    { term: 'retarded', matchType: 'substring' },
    { term: 'wetback', matchType: 'substring' },
    { term: 'tranny', matchType: 'substring' },
  ],
};
