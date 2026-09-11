import type { ModerationTermSet } from '@infrastructure/moderation/data/moderation-term-set';

export const PROFANITY_EN: ModerationTermSet = {
  category: 'profanity',
  appliesTo: 'all',
  terms: [
    // Short/ambiguous roots — matched as a whole token only, since as a
    // substring they collide with common (and, for a recipe app, common
    // *cooking*) words: "class"/"assistant" (ass), "cocktail"/"cockerel"
    // (cock), "cumin"/"cucumber" (cum).
    { term: 'ass', matchType: 'word' },
    { term: 'cock', matchType: 'word' },
    { term: 'cum', matchType: 'word' },

    { term: 'fuck', matchType: 'substring' },
    { term: 'shit', matchType: 'substring' },
    { term: 'bitch', matchType: 'substring' },
    { term: 'cunt', matchType: 'substring' },
    { term: 'dick', matchType: 'substring' },
    { term: 'pussy', matchType: 'substring' },
    { term: 'asshole', matchType: 'substring' },
    { term: 'bastard', matchType: 'substring' },
    { term: 'twat', matchType: 'substring' },
    { term: 'wanker', matchType: 'substring' },
    { term: 'douchebag', matchType: 'substring' },
    { term: 'dumbass', matchType: 'substring' },
  ],
};
