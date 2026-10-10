import { z } from 'zod';
import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';

// Every refusal carries a catalogue key, including a wrong TYPE: zod's own
// messages are English copy the error handler would forward to any locale.
// Lengths are checked again by the entity after whitespace is squished; these
// bounds only stop an oversized payload early.
const keyed = (key: string) => ({ invalid_type_error: key, required_error: key });

const ITEM_INVALID = 'errors.validation.shopping_item_invalid';

const label = z
  .string(keyed('errors.validation.shopping_label_required'))
  .trim()
  .min(1, 'errors.validation.shopping_label_required')
  .max(ShoppingListLimits.LabelMaxLength, 'errors.validation.shopping_label_too_long');
const quantity = z
  .number(keyed('errors.validation.shopping_quantity_invalid'))
  .positive('errors.validation.shopping_quantity_invalid')
  .max(ShoppingListLimits.QuantityMax, 'errors.validation.shopping_quantity_invalid')
  .nullable();
const unit = z
  .string(keyed('errors.validation.shopping_unit_too_long'))
  .max(ShoppingListLimits.UnitMaxLength, 'errors.validation.shopping_unit_too_long')
  .nullable();

const newItem = z.object({
  label,
  quantity: quantity.optional(),
  unit: unit.optional(),
  recipeId: z.string(keyed(ITEM_INVALID)).uuid(ITEM_INVALID).nullable().optional(),
  recipeName: z.string(keyed(ITEM_INVALID)).max(ShoppingListLimits.RecipeNameMaxLength, ITEM_INVALID).nullable().optional(),
});

export const AddShoppingItemsBodySchema = z.object({
  items: z
    .array(newItem, keyed('errors.validation.shopping_batch_invalid'))
    .min(1, 'errors.validation.shopping_batch_invalid')
    .max(ShoppingListLimits.BatchMax, 'errors.validation.shopping_batch_invalid'),
});

export const UpdateShoppingItemBodySchema = z
  .object({
    label: label.optional(),
    quantity: quantity.optional(),
    unit: unit.optional(),
    checked: z.boolean(keyed(ITEM_INVALID)).optional(),
  })
  .refine(
    (body) => body.label !== undefined || body.quantity !== undefined || body.unit !== undefined || body.checked !== undefined,
    { message: 'errors.validation.nothing_to_edit' },
  );

export const ShoppingItemIdParamSchema = z.object({
  id: z.string().uuid('errors.not_found.shopping_item'),
});
