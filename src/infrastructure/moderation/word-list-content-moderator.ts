import type {
  IContentModerator,
  ModerateTextRequest,
  ModerationContext,
  ContentVerdict,
} from '@application/moderation/ports/i-content-moderator';
import type { ModerationTermSet } from '@infrastructure/moderation/data/types';
import { CSA } from '@infrastructure/moderation/data/csa';
import { HATE } from '@infrastructure/moderation/data/hate';
import { SEXUAL } from '@infrastructure/moderation/data/sexual';
import { PROFANITY_TR } from '@infrastructure/moderation/data/profanity-tr';
import { PROFANITY_EN } from '@infrastructure/moderation/data/profanity-en';
import { DANGEROUS_SUBSTANCES } from '@infrastructure/moderation/data/dangerous-substances';
import { WHITELIST } from '@infrastructure/moderation/data/whitelist';

// Checked in order of severity — if text somehow trips more than one
// category, the most severe one is what gets reported.
const TERM_SETS: readonly ModerationTermSet[] = [CSA, HATE, SEXUAL, PROFANITY_TR, PROFANITY_EN, DANGEROUS_SUBSTANCES];

// Applied to both representations. Note that dotless "ı" is handled
// separately (see DOTLESS_I_FOLD) — folding it here unconditionally would
// turn "sık" (squeeze — a core recipe verb: "limonu sık") and "şık"
// (elegant) into the slur "sik".
const TURKISH_FOLD: ReadonlyArray<readonly [RegExp, string]> = [
  [/İ/g, 'i'],
  [/I/g, 'i'],
  [/Ş/g, 's'],
  [/ş/g, 's'],
  [/Ç/g, 'c'],
  [/ç/g, 'c'],
  [/Ğ/g, 'g'],
  [/ğ/g, 'g'],
  [/Ö/g, 'o'],
  [/ö/g, 'o'],
  [/Ü/g, 'u'],
  [/ü/g, 'u'],
];

const LEET_FOLD: Readonly<Record<string, string>> = {
  '4': 'a',
  '1': 'i',
  '0': 'o',
  '3': 'e',
  '5': 's',
  $: 's',
  '@': 'a',
  '7': 't',
  '!': 'i',
};

interface NormalizedText {
  // Dotless "ı" preserved as its own letter — used for 'word' rules, whose
  // terms are short roots where an ı/i collision produces real false
  // positives ("sık", "şık", "sıkma").
  readonly tokens: readonly string[];
  // Dotless "ı" folded to "i" — used for 'substring' rules, whose terms are
  // long enough to be collision-free, and several of which legitimately
  // contain ı ("amcık" → "amcik").
  readonly compact: string;
}

function foldTurkish(input: string): string {
  return TURKISH_FOLD.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), input);
}

function foldDotlessI(input: string): string {
  return input.replace(/ı/g, 'i');
}

function foldLeetspeak(input: string): string {
  return input.replace(/[410735$@!]/g, (ch) => LEET_FOLD[ch] ?? ch);
}

// 3+ repeats only, so legitimate double letters ("tatlı", "kahve") survive.
function collapseRepeats(input: string): string {
  return input.replace(/(.)\1{2,}/g, '$1');
}

// Defeats letter-spacing evasion ("s i k", "s.i.k") by gluing consecutive
// single-character tokens into one token.
function mergeSingleCharTokens(rawTokens: readonly string[]): string[] {
  const merged: string[] = [];
  let buffer = '';
  for (const token of rawTokens) {
    if (token.length === 1) {
      buffer += token;
      continue;
    }
    if (buffer.length > 0) {
      merged.push(buffer);
      buffer = '';
    }
    merged.push(token);
  }
  if (buffer.length > 0) merged.push(buffer);
  return merged;
}

function normalize(text: string): NormalizedText {
  const folded = foldLeetspeak(foldTurkish(text).toLowerCase());
  const collapsed = collapseRepeats(folded);
  const collapsedDotless = foldDotlessI(collapsed);

  const rawTokens = collapsed.split(/[^a-zı0-9]+/).filter((token) => token.length > 0);
  const tokens = mergeSingleCharTokens(rawTokens);
  const compact = collapsedDotless.replace(/[^a-z0-9]/g, '');

  return { tokens, compact };
}

function isWhitelistedAt(compact: string, matchIndex: number, matchLength: number): boolean {
  const matchEnd = matchIndex + matchLength;
  for (const safeWord of WHITELIST) {
    let from = 0;
    let index = compact.indexOf(safeWord, from);
    while (index !== -1) {
      if (index <= matchIndex && matchEnd <= index + safeWord.length) return true;
      from = index + 1;
      index = compact.indexOf(safeWord, from);
    }
  }
  return false;
}

// True if `term` occurs anywhere in `compact` outside of a whitelisted span.
function hasUnwhitelistedOccurrence(compact: string, term: string): boolean {
  let from = 0;
  let index = compact.indexOf(term, from);
  while (index !== -1) {
    if (!isWhitelistedAt(compact, index, term.length)) return true;
    from = index + 1;
    index = compact.indexOf(term, from);
  }
  return false;
}

// Deterministic word-list filter — runs before the Groq semantic moderators
// and short-circuits on the first hit. See IContentModerator for the
// contract this fulfils.
export class WordListContentModerator implements IContentModerator {
  moderate(req: ModerateTextRequest): ContentVerdict {
    const context: ModerationContext = req.context ?? 'general';
    const { tokens, compact } = normalize(req.text);

    for (const set of TERM_SETS) {
      if (set.appliesTo === 'recipe' && context !== 'recipe') continue;

      for (const entry of set.terms) {
        const isHit =
          entry.matchType === 'word'
            ? tokens.includes(entry.term)
            : hasUnwhitelistedOccurrence(compact, entry.term);

        if (isHit) {
          return { status: 'rejected', hit: { category: set.category, term: entry.term } };
        }
      }
    }

    return { status: 'approved' };
  }
}
