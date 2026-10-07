import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { foldText } from '@domain/common/fold-text';
import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';
import { ShoppingQuantity } from '@domain/shopping/shopping-quantity';

export interface ShoppingItemProps {
  id: string;
  userId: string;
  label: string;
  quantity: number | null;
  unit: string | null;
  recipeId: string | null;
  /** The recipe's title when the item was added — a snapshot, never re-read. */
  recipeName: string | null;
  checked: boolean;
  /** Insertion order within the list; lower first. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShoppingItemChange {
  readonly label?: string;
  readonly quantity?: number | null;
  readonly unit?: string | null;
  readonly checked?: boolean;
}

const WHITESPACE_RUN = /\s+/g;
const squish = (text: string): string => text.replace(WHITESPACE_RUN, ' ').trim();
const blankToNull = (text: string | null): string | null => {
  if (text === null) return null;
  const squished = squish(text);
  return squished.length === 0 ? null : squished;
};

/**
 * One line on a user's shopping list.
 *
 * @remarks
 * - **Text is stored squished** (trimmed, inner whitespace collapsed); an empty
 *   unit or recipe name is `null`, never `''`.
 * - **{@link mergeKey} decides what counts as "the same item"**: the label and
 *   unit folded the way search folds text, so "Domates" and "domates " merge,
 *   and "Su  Bardağı" matches "su bardagi". Different units never merge — 200 g
 *   and 1 cup of flour are not summable without a conversion table.
 * - **Only an unchecked item absorbs another** ({@link canAbsorb}): a ticked-off
 *   item is already in the basket, so adding it again is a new line.
 * - **A recipe name only travels with a recipe id.**
 */
export class ShoppingItem extends Entity<ShoppingItemProps> {
  private constructor(props: ShoppingItemProps) {
    super(props);
  }

  static create(props: ShoppingItemProps): Result<ShoppingItem, ValidationFailure> {
    const label = squish(props.label);
    if (label.length === 0) return fail(new ValidationFailure('errors.validation.shopping_label_required', 'label'));
    if (label.length > ShoppingListLimits.LabelMaxLength) {
      return fail(new ValidationFailure('errors.validation.shopping_label_too_long', 'label'));
    }
    if (!ShoppingQuantity.isValid(props.quantity)) {
      return fail(new ValidationFailure('errors.validation.shopping_quantity_invalid', 'quantity'));
    }
    const unit = blankToNull(props.unit);
    if (unit !== null && unit.length > ShoppingListLimits.UnitMaxLength) {
      return fail(new ValidationFailure('errors.validation.shopping_unit_too_long', 'unit'));
    }
    const recipeName = props.recipeId === null ? null : blankToNull(props.recipeName);
    if (recipeName !== null && recipeName.length > ShoppingListLimits.RecipeNameMaxLength) {
      return fail(new ValidationFailure('errors.validation.shopping_item_invalid', 'recipeName'));
    }
    const quantity = props.quantity === null ? null : ShoppingQuantity.round(props.quantity);
    return ok(new ShoppingItem({ ...props, label, unit, recipeName, quantity }));
  }

  /** The identity two items merge on: folded label + folded unit. */
  static mergeKey(label: string, unit: string | null): string {
    return `${foldText(squish(label))}\u0000${foldText(squish(unit ?? ''))}`;
  }

  get mergeKey(): string {
    return ShoppingItem.mergeKey(this.props.label, this.props.unit);
  }

  canAbsorb(other: ShoppingItem): boolean {
    return !this.props.checked && this.mergeKey === other.mergeKey;
  }

  /** This item with `other`'s quantity added; label, unit and source stay this item's. */
  absorb(other: ShoppingItem, now: Date): Result<ShoppingItem, ValidationFailure> {
    return ShoppingItem.create({
      ...this.props,
      quantity: ShoppingQuantity.sum(this.props.quantity, other.quantity),
      updatedAt: now,
    });
  }

  /** A copy with the change applied, re-validated as a whole. */
  apply(change: ShoppingItemChange, now: Date): Result<ShoppingItem, ValidationFailure> {
    return ShoppingItem.create({
      ...this.props,
      ...(change.label !== undefined ? { label: change.label } : {}),
      ...(change.quantity !== undefined ? { quantity: change.quantity } : {}),
      ...(change.unit !== undefined ? { unit: change.unit } : {}),
      ...(change.checked !== undefined ? { checked: change.checked } : {}),
      updatedAt: now,
    });
  }

  get userId(): string { return this.props.userId; }
  get label(): string { return this.props.label; }
  get quantity(): number | null { return this.props.quantity; }
  get unit(): string | null { return this.props.unit; }
  get recipeId(): string | null { return this.props.recipeId; }
  get recipeName(): string | null { return this.props.recipeName; }
  get checked(): boolean { return this.props.checked; }
  get position(): number { return this.props.position; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}
