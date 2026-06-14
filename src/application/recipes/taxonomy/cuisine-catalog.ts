import { CuisineKey } from '@domain/recipes/cuisine-key';
import type { TaxonomyMeta } from '@application/recipes/taxonomy/taxonomy-meta';

/**
 * Single source of truth for cuisine display metadata (emoji + localized
 * names). Keyed by {@link CuisineKey}; the iteration order for the API comes
 * from `CUISINE_KEY_VALUES`, not from this record.
 */
export const CUISINE_CATALOG: Record<CuisineKey, TaxonomyMeta> = {
  [CuisineKey.Turkish]: { emoji: '🥙', en: 'Turkish', tr: 'Türk' },
  [CuisineKey.Italian]: { emoji: '🍕', en: 'Italian', tr: 'İtalyan' },
  [CuisineKey.Mexican]: { emoji: '🌮', en: 'Mexican', tr: 'Meksika' },
  [CuisineKey.Chinese]: { emoji: '🥟', en: 'Chinese', tr: 'Çin' },
  [CuisineKey.Japanese]: { emoji: '🍣', en: 'Japanese', tr: 'Japon' },
  [CuisineKey.Indian]: { emoji: '🍛', en: 'Indian', tr: 'Hint' },
  [CuisineKey.French]: { emoji: '🥐', en: 'French', tr: 'Fransız' },
  [CuisineKey.Greek]: { emoji: '🫒', en: 'Greek', tr: 'Yunan' },
  [CuisineKey.American]: { emoji: '🍔', en: 'American', tr: 'Amerikan' },
  [CuisineKey.Mediterranean]: { emoji: '🍋', en: 'Mediterranean', tr: 'Akdeniz' },
  [CuisineKey.Thai]: { emoji: '🍜', en: 'Thai', tr: 'Tayland' },
  [CuisineKey.Spanish]: { emoji: '🥘', en: 'Spanish', tr: 'İspanyol' },
  [CuisineKey.Korean]: { emoji: '🍱', en: 'Korean', tr: 'Kore' },
  [CuisineKey.MiddleEastern]: { emoji: '🧆', en: 'Middle Eastern', tr: 'Orta Doğu' },
  [CuisineKey.German]: { emoji: '🥨', en: 'German', tr: 'Alman' },
  [CuisineKey.British]: { emoji: '🫖', en: 'British', tr: 'İngiliz' },
  [CuisineKey.Vietnamese]: { emoji: '🍲', en: 'Vietnamese', tr: 'Vietnam' },
  [CuisineKey.Lebanese]: { emoji: '🧆', en: 'Lebanese', tr: 'Lübnan' },
  [CuisineKey.Moroccan]: { emoji: '🍲', en: 'Moroccan', tr: 'Fas' },
  [CuisineKey.Brazilian]: { emoji: '🍖', en: 'Brazilian', tr: 'Brezilya' },
  [CuisineKey.Russian]: { emoji: '🥟', en: 'Russian', tr: 'Rus' },
  [CuisineKey.Persian]: { emoji: '🍢', en: 'Persian', tr: 'İran' },
  [CuisineKey.Caribbean]: { emoji: '🍹', en: 'Caribbean', tr: 'Karayip' },
  [CuisineKey.Filipino]: { emoji: '🍚', en: 'Filipino', tr: 'Filipin' },
  [CuisineKey.Indonesian]: { emoji: '🍤', en: 'Indonesian', tr: 'Endonezya' },
  [CuisineKey.Pakistani]: { emoji: '🍛', en: 'Pakistani', tr: 'Pakistan' },
  [CuisineKey.Caucasian]: { emoji: '🥟', en: 'Caucasian', tr: 'Kafkas' },
  [CuisineKey.African]: { emoji: '🍲', en: 'African', tr: 'Afrika' },
  [CuisineKey.Georgian]: { emoji: '🫓', en: 'Georgian', tr: 'Gürcü' },
  [CuisineKey.Azerbaijani]: { emoji: '🍢', en: 'Azerbaijani', tr: 'Azerbaycan' },
  [CuisineKey.Armenian]: { emoji: '🥙', en: 'Armenian', tr: 'Ermeni' },
  [CuisineKey.Uzbek]: { emoji: '🍚', en: 'Uzbek', tr: 'Özbek' },
  [CuisineKey.CentralAsian]: { emoji: '🍖', en: 'Central Asian', tr: 'Orta Asya' },
  [CuisineKey.Syrian]: { emoji: '🧆', en: 'Syrian', tr: 'Suriye' },
  [CuisineKey.Egyptian]: { emoji: '🫓', en: 'Egyptian', tr: 'Mısır' },
  [CuisineKey.Tunisian]: { emoji: '🌶️', en: 'Tunisian', tr: 'Tunus' },
  [CuisineKey.Balkan]: { emoji: '🍖', en: 'Balkan', tr: 'Balkan' },
  [CuisineKey.Portuguese]: { emoji: '🐟', en: 'Portuguese', tr: 'Portekiz' },
  [CuisineKey.Polish]: { emoji: '🥟', en: 'Polish', tr: 'Polonya' },
  [CuisineKey.Swedish]: { emoji: '🫐', en: 'Swedish', tr: 'İsveç' },
  [CuisineKey.Malaysian]: { emoji: '🍜', en: 'Malaysian', tr: 'Malezya' },
  [CuisineKey.Peruvian]: { emoji: '🐟', en: 'Peruvian', tr: 'Peru' },
  [CuisineKey.Argentinian]: { emoji: '🥩', en: 'Argentinian', tr: 'Arjantin' },
  [CuisineKey.Other]: { emoji: '🍽️', en: 'Other', tr: 'Diğer' },
};
