import type { ServingUnitKeyType } from '@domain/foods/serving-unit-key';

/**
 * A household portion of a product — "a glass is 200". `amount` is in the
 * product's base unit (g or ml), so one portion's nutrients are
 * per-100 × amount / 100.
 */
export interface ServingUnit {
  readonly key: ServingUnitKeyType;
  readonly amount: number;
}
