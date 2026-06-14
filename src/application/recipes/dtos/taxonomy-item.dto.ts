/**
 * A single selectable cuisine or category, shaped for the client picker.
 * `key` is the stable enum value persisted on a recipe; `name` is already
 * localized to the request locale; `emoji` is the display glyph.
 */
export interface TaxonomyItemDto {
  key: string;
  name: string;
  emoji: string;
}
