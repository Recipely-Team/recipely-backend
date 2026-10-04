import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import type { CalendarDate } from '@domain/diary/calendar-date';
import type { MealSlotType } from '@domain/diary/meal-slot';
import type { Nutrients } from '@domain/diary/nutrients';
import { DiaryLimits } from '@domain/diary/diary-limits';
import type { LoggedProduct } from '@domain/diary/logged-product';

export interface FoodLogEntryProps {
  id: string;
  userId: string;
  date: CalendarDate;
  meal: MealSlotType;
  name: string;
  servings: number;
  /** Totals for the whole entry — already multiplied by `servings`. */
  nutrients: Nutrients;
  recipeId: string | null;
  /** The product it was logged from; absent for a recipe or quick-add entry. */
  product?: LoggedProduct | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FoodLogEntryChange {
  readonly meal?: MealSlotType;
  readonly servings?: number;
  readonly date?: CalendarDate;
}

/**
 * One food a user logged against a day and a meal.
 *
 * @remarks
 * - **The numbers are the client's snapshot**, taken when it was logged. A
 *   recipe edited afterwards must not rewrite what someone already ate.
 * - **Changing servings rescales the stored totals**, proportionally, rather
 *   than recomputing them from a recipe — for the same reason.
 * - **A recipe or a product, never both.** A product entry's `servings` is
 *   its quantity of `product.unitKey`.
 */
export class FoodLogEntry extends Entity<FoodLogEntryProps> {
  private constructor(props: FoodLogEntryProps) {
    super(props);
  }

  static create(props: FoodLogEntryProps): Result<FoodLogEntry, ValidationFailure> {
    const name = props.name.trim();
    if (name.length === 0) return fail(new ValidationFailure('errors.validation.food_name_required', 'name'));
    if (name.length > DiaryLimits.NameMaxLength) {
      return fail(new ValidationFailure('errors.validation.food_name_too_long', 'name'));
    }
    if (!FoodLogEntry.isValidServings(props.servings, (props.product ?? null) !== null)) {
      return fail(new ValidationFailure('errors.validation.servings_invalid', 'servings'));
    }
    if (props.recipeId !== null && (props.product ?? null) !== null) {
      return fail(new ValidationFailure('errors.validation.food_product_invalid', 'product'));
    }
    return ok(new FoodLogEntry({ ...props, name }));
  }

  /**
   * Half steps from ½ — to 20 servings, the portion picker's own scale, or for
   * a product to {@link DiaryLimits.ProductQuantityMax} units (150 g is 150).
   */
  static isValidServings(servings: number, isProduct = false): boolean {
    return (
      Number.isFinite(servings) &&
      servings >= DiaryLimits.ServingsMin &&
      servings <= (isProduct ? DiaryLimits.ProductQuantityMax : DiaryLimits.ServingsMax) &&
      Number.isInteger(servings / DiaryLimits.ServingsStep)
    );
  }

  /** A copy with the change applied; totals follow a servings change. */
  apply(change: FoodLogEntryChange, now: Date): Result<FoodLogEntry, ValidationFailure> {
    const servings = change.servings ?? this.props.servings;
    if (!FoodLogEntry.isValidServings(servings, this.product !== null)) {
      return fail(new ValidationFailure('errors.validation.servings_invalid', 'servings'));
    }
    const nutrients =
      servings === this.props.servings ? this.props.nutrients : this.props.nutrients.scale(servings / this.props.servings);
    return ok(
      new FoodLogEntry({
        ...this.props,
        meal: change.meal ?? this.props.meal,
        date: change.date ?? this.props.date,
        servings,
        nutrients,
        updatedAt: now,
      }),
    );
  }

  /** The same food, sized to exactly one serving. */
  perServing(): Nutrients {
    return this.props.nutrients.scale(1 / this.props.servings);
  }

  get userId(): string { return this.props.userId; }
  get date(): CalendarDate { return this.props.date; }
  get meal(): MealSlotType { return this.props.meal; }
  get name(): string { return this.props.name; }
  get servings(): number { return this.props.servings; }
  get nutrients(): Nutrients { return this.props.nutrients; }
  get recipeId(): string | null { return this.props.recipeId; }
  get product(): LoggedProduct | null { return this.props.product ?? null; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
