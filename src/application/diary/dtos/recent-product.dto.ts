import type { LoggedProductDto } from '@application/diary/dtos/logged-product.dto';

/**
 * A recent food's product: what it was logged from, the unit, and one unit's
 * nutrients — unrounded (the entry's totals ÷ its quantity), so quantity ×
 * perUnit gives back the logged numbers at any quantity.
 */
export interface RecentProductDto extends LoggedProductDto {
  /** The curated food (open its detail with it); `null` for Open Food Facts. */
  readonly foodId: string | null;
  readonly perUnit: {
    readonly kcal: number;
    readonly protein: number | null;
    readonly carbs: number | null;
    readonly fat: number | null;
    readonly fiber: number | null;
  };
}
