import type { ModerationTermSet } from '@infrastructure/moderation/data/types';

// Turkish vulgar/profane terms and their common inflected forms.
//
// Deliberately EXCLUDED, despite being common insults, because they collide
// with legitimate Turkish recipe vocabulary or with common English words used
// throughout this bilingual app:
//   - "am"   — collides with the English auxiliary verb ("I am so happy...").
//   - "göt"  — folds to "got", the English past tense of "get" ("you got this!").
//   - "piç"  — folds to "pic", extremely common shorthand for "picture".
//   - "kaşar" — folds to "kasar", also "kaşar peyniri" (kashar), a real cheese.
//   - "hıyar" — folds to "hiyar", also the Turkish word for cucumber.
export const PROFANITY_TR: ModerationTermSet = {
  category: 'profanity',
  appliesTo: 'all',
  terms: [
    // Short/ambiguous roots — matched as a whole token only (Scunthorpe
    // defense): "tamam", "salam", "sıkı", "sıkma", "sikke", "amasya" must
    // never match.
    { term: 'sik', matchType: 'word' },
    { term: 'amk', matchType: 'word' },
    { term: 'aq', matchType: 'word' },
    { term: 'awk', matchType: 'word' },
    { term: 'yarak', matchType: 'word' },
    { term: 'yarrak', matchType: 'word' },
    { term: 'tasak', matchType: 'word' },
    { term: 'pust', matchType: 'word' },

    // Longer/compound forms — unique enough to match as a substring.
    { term: 'siktir', matchType: 'substring' },
    { term: 'sikik', matchType: 'substring' },
    { term: 'sikko', matchType: 'substring' },
    { term: 'siktigim', matchType: 'substring' },
    { term: 'siktiginin', matchType: 'substring' },
    { term: 'sikerim', matchType: 'substring' },
    { term: 'sikeyim', matchType: 'substring' },
    { term: 'sikiyim', matchType: 'substring' },
    { term: 'sikecegim', matchType: 'substring' },
    { term: 'sikerler', matchType: 'substring' },
    { term: 'sikismek', matchType: 'substring' },
    { term: 'sikis', matchType: 'substring' },
    { term: 'yarragim', matchType: 'substring' },
    { term: 'yarragina', matchType: 'substring' },
    { term: 'yaragini', matchType: 'substring' },
    { term: 'gotveren', matchType: 'substring' },
    { term: 'gotlek', matchType: 'substring' },
    { term: 'yavsak', matchType: 'substring' },
    { term: 'orospu', matchType: 'substring' },
    { term: 'pezevenk', matchType: 'substring' },
    { term: 'kahpe', matchType: 'substring' },
    { term: 'surtuk', matchType: 'substring' },
    { term: 'amcik', matchType: 'substring' },
    { term: 'amcigini', matchType: 'substring' },
    { term: 'sokayim', matchType: 'substring' },
    { term: 'aminakoyayim', matchType: 'substring' },
    { term: 'aminakoydum', matchType: 'substring' },
    { term: 'kaltak', matchType: 'substring' },
    { term: 'tassak', matchType: 'substring' },
  ],
};
