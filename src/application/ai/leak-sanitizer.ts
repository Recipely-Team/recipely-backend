import { CUISINE_KEY_VALUES } from '@domain/recipes/cuisine-key';
import { RECIPE_CATEGORY_VALUES } from '@domain/recipes/recipe-category';

// Deterministic backstop for RefineRecipeUseCase — a prompt is a strong
// signal but not a guarantee, so the free-text "summary"/"suggestion" fields
// returned by any provider are scanned here before they reach the user.

// Enum keys that contain an underscore never occur as ordinary words in
// natural prose — a bare case-sensitive whole-word match is enough.
const UNAMBIGUOUS_ENUM_KEYS: readonly string[] = [...CUISINE_KEY_VALUES, ...RECIPE_CATEGORY_VALUES].filter((key) =>
  key.includes('_'),
);

// Enum keys that double as ordinary English words (SOUP, PIE, GRILL, CAKE...)
// or difficulty levels — only treated as a leak when they appear ALL-CAPS in
// text that is not itself shouted in all-caps (which would make the ALL-CAPS
// signal meaningless).
const AMBIGUOUS_ENUM_KEYS: readonly string[] = [
  ...[...CUISINE_KEY_VALUES, ...RECIPE_CATEGORY_VALUES].filter((key) => !key.includes('_')),
  'EASY',
  'MEDIUM',
  'HARD',
];

const SCHEMA_FIELD_NAMES = [
  'prepTimeMinutes',
  'cookTimeMinutes',
  'caloriesPerServing',
  'mealType',
  'isRecipe',
  'isPublished',
  'moderationStatus',
  'ownerId',
] as const;

interface Marker {
  readonly value: string;
  // Turkish agglutinates suffixes directly onto a stem/loanword with no
  // separator ("şemaya", "şemadan", "veritabanında"...), so there is no
  // genuine trailing word boundary to require for these two — only the
  // leading boundary (nothing letter/digit-like immediately before it) is
  // checked. ASCII markers keep the strict leading+trailing check.
  readonly trailingBoundary?: boolean;
}

// Case-insensitive markers for internal/system vocabulary that has no
// business appearing in a message to a home cook.
const CASE_INSENSITIVE_MARKERS: readonly Marker[] = [
  { value: 'JSON' },
  { value: 'schema' },
  { value: 'şema', trailingBoundary: false },
  { value: 'system prompt' },
  { value: 'sistem prompt' },
  { value: 'enum' },
  { value: 'database' },
  { value: 'veritabanı', trailingBoundary: false },
  { value: 'backend' },
  { value: 'endpoint' },
  { value: 'API key' },
  { value: 'prompt' },
];

// "nutrition" is an ordinary English word, so it only counts as a leak when it
// appears QUOTED as a JSON key or value. The quotes are required on both sides —
// keying off a bare colon would flag friendly prose like "Tip: nutrition is now
// more balanced.", which is exactly the text this feature exists to allow.
const NUTRITION_AS_JSON_KEY = /["'‘’“”]\s*nutrition\s*["'‘’“”]\s*:|:\s*["'‘’“”]\s*nutrition\s*["'‘’“”]/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Unicode-aware whole-word matcher. Plain `\b` only recognises ASCII
// [A-Za-z0-9_] as "word" characters, so a marker starting or ending with a
// Turkish letter (ş, ı, ğ...) never gets a genuine boundary — the `u` flag
// plus `\p{L}\p{N}_`-based lookaround fixes that. `trailingBoundary: false`
// omits the trailing check for markers that Turkish suffixes attach to
// directly (see the `Marker` doc above).
function wholeWord(value: string, flags: string, trailingBoundary = true): RegExp {
  const leading = '(?<![\\p{L}\\p{N}_])';
  const trailing = trailingBoundary ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(`${leading}${escapeRegExp(value)}${trailing}`, `${flags}u`);
}

// A rough "is this text being shouted" check — if most letters are already
// uppercase, an ALL-CAPS ordinary word (SOUP, PIE, GRILL...) is not a
// meaningful signal of a leak.
function isShoutyText(text: string): boolean {
  const letters = text.match(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/g) ?? [];
  if (letters.length < 8) return false;
  const upper = letters.filter((ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase()).length;
  return upper / letters.length > 0.8;
}

export function containsInternalLeak(text: string): boolean {
  if (!text) return false;

  for (const key of UNAMBIGUOUS_ENUM_KEYS) {
    if (wholeWord(key, '').test(text)) return true;
  }

  if (!isShoutyText(text)) {
    for (const key of AMBIGUOUS_ENUM_KEYS) {
      if (wholeWord(key, '').test(text)) return true;
    }
  }

  for (const field of SCHEMA_FIELD_NAMES) {
    if (wholeWord(field, '').test(text)) return true;
  }

  if (NUTRITION_AS_JSON_KEY.test(text)) return true;

  for (const marker of CASE_INSENSITIVE_MARKERS) {
    if (wholeWord(marker.value, 'i', marker.trailingBoundary ?? true).test(text)) return true;
  }

  return false;
}
