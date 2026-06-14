import type { TaxonomyItemDto } from '@application/recipes/dtos/taxonomy-item.dto';
import type { TaxonomyMeta } from '@application/recipes/taxonomy/taxonomy-meta';

/**
 * Builds the localized, ordered list of taxonomy items the client picker
 * renders. Iteration order follows `keys` (the canonical enum order); the
 * label is taken from the catalog entry for the requested locale, falling
 * back to English for any non-`tr` locale or missing translation. A key with
 * no catalog entry degrades gracefully to the raw key + a generic emoji
 * rather than crashing.
 */
export function toTaxonomyList(
  keys: readonly string[],
  catalog: Record<string, TaxonomyMeta>,
  locale: string,
): TaxonomyItemDto[] {
  return keys.map((key) => {
    const meta = catalog[key];
    if (!meta) {
      return { key, name: key, emoji: '🍽️' };
    }
    return { key, name: locale === 'tr' ? meta.tr : meta.en, emoji: meta.emoji };
  });
}
