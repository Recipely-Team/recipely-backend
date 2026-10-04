import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { DiaryLimits } from '@domain/diary/diary-limits';
import { FoodSource, type FoodSourceType } from '@domain/foods/food-source';
import { isFoodUnit } from '@domain/foods/food-unit';
import { isServingUnitKey } from '@domain/foods/serving-unit-key';

const BARCODE = /^\d{6,14}$/;

export interface LoggedProductProps {
  readonly source: FoodSourceType;
  /** The curated variant; `null` for Open Food Facts, or once the variant left the catalogue. */
  readonly foodVariantId: string | null;
  readonly offBarcode: string | null;
  /** 'g', 'ml', or a serving-unit key ("glass", "pack", …). */
  readonly unitKey: string;
  /** How many base g/ml ONE unit is — 1 for 'g' and 'ml', 200 for a 200 ml glass. */
  readonly unitAmount: number;
}

/**
 * **The product a diary entry was logged from**, and the unit it was counted in.
 *
 * @remarks
 * - Value object of `FoodLogEntry`; a recipe or quick-add entry has none.
 * - The entry's `servings` is the quantity of `unitKey` (½ steps), and its
 *   nutrients are that many units' worth — so per-unit values are
 *   `nutrients / servings` and totals stay Σ unit × quantity.
 * - A new one names exactly the reference its source has: a curated variant
 *   id, or an Open Food Facts barcode (6–14 digits). `restore` skips that
 *   check, because a variant removed from the catalogue nulls the id while the
 *   entry's snapshot stays readable.
 */
export class LoggedProduct {
  private constructor(readonly props: LoggedProductProps) {}

  static create(props: LoggedProductProps): Result<LoggedProduct, ValidationFailure> {
    const curated = props.source === FoodSource.Curated;
    const refOk = curated
      ? props.foodVariantId !== null && props.offBarcode === null
      : props.foodVariantId === null && props.offBarcode !== null && BARCODE.test(props.offBarcode);
    if (!refOk) return fail(new ValidationFailure('errors.validation.food_product_invalid', 'product'));
    if (!isFoodUnit(props.unitKey) && !isServingUnitKey(props.unitKey)) {
      return fail(new ValidationFailure('errors.validation.food_unit_invalid', 'unitKey'));
    }
    if (!Number.isFinite(props.unitAmount) || props.unitAmount <= 0 || props.unitAmount > DiaryLimits.ProductUnitAmountMax) {
      return fail(new ValidationFailure('errors.validation.food_amount_invalid', 'unitAmount'));
    }
    return ok(new LoggedProduct(props));
  }

  static restore(props: LoggedProductProps): LoggedProduct {
    return new LoggedProduct(props);
  }

  get source(): FoodSourceType { return this.props.source; }
  get foodVariantId(): string | null { return this.props.foodVariantId; }
  get offBarcode(): string | null { return this.props.offBarcode; }
  get unitKey(): string { return this.props.unitKey; }
  get unitAmount(): number { return this.props.unitAmount; }
}
