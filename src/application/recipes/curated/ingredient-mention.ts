/** Turkish final-consonant softening before a vowel suffix: mercimek → mercimeği, havuç → havucu. */
const SOFTENED: Readonly<Record<string, string>> = { k: 'ğ', ç: 'c', p: 'b', t: 'd' };

/** NFC first, so a decomposed "ç" (c + U+0327) and a composed one are the same text. */
const lower = (text: string, locale: string): string => text.normalize('NFC').toLocaleLowerCase(locale).replace(/\s+/g, ' ').trim();
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The spellings a label may take in running text: itself and, in Turkish, its softened stem. */
const labelForms = (label: string, locale: string): string[] => {
  const base = lower(label, locale);
  const soft = locale === 'tr' ? SOFTENED[base.slice(-1)] : undefined;
  return soft === undefined ? [base] : [base, base.slice(0, -1) + soft];
};

/**
 * Whether `steps` mention the ingredient `label`, in `locale`.
 *
 * @remarks
 * - **At a word start, any ending after.** The label must begin a word — not
 *   sit inside one — so "et" is not found in "bekletin", "oil" in "boil",
 *   "ice" in "slice"; a suffix is allowed, so "tuz" is found in "tuzu" and
 *   "egg" in "eggs". "Word" is Unicode letters and combining marks
 *   (`\p{L}`, `\p{M}`), so ç, ğ, ı, ş count, and text is NFC-normalised
 *   first, so a decomposed "ç" does not end a word early.
 * - **Turkish-aware**: lowered with the `tr` locale (İ → i, I → ı) and the
 *   stem's final consonant may soften (mercimek → mercimeği).
 * - **Known false negatives** — valid text the gate still rejects, fixed by
 *   rewording the step or the label:
 *   - a head-noun-only mention ("the lentils" for the label "red lentils");
 *   - English plural label vs singular text ("tomatoes" / "the tomato"; the
 *     reverse matches, since a suffix is allowed);
 *   - Turkish vowel drop before a suffix (beyin → beyni, ağız → ağzı).
 * - **Known false positive**: a label that starts a longer, different word
 *   ("egg" in "eggplant").
 */
export const mentionsIngredient = (steps: string, label: string, locale: string): boolean => {
  const text = lower(steps, locale);
  return labelForms(label, locale).some((form) => new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(form)}`, 'u').test(text));
};
