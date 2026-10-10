import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';
import { AddShoppingItemsBodySchema, UpdateShoppingItemBodySchema } from '@presentation/validators/shopping-list.validators';

const firstMessage = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.success ? null : result.error?.issues[0]?.message;

describe('shopping list validators', () => {
  it('accepts a minimal line and a full one', () => {
    expect(AddShoppingItemsBodySchema.safeParse({ items: [{ label: 'Tuz' }] }).success).toBe(true);
    expect(
      AddShoppingItemsBodySchema.safeParse({
        items: [{ label: 'Un', quantity: 1.5, unit: 'su bardağı', recipeId: '11111111-1111-4111-8111-111111111111', recipeName: 'Kek' }],
      }).success,
    ).toBe(true);
  });

  it('answers every refusal with a catalogue key', () => {
    expect(firstMessage(AddShoppingItemsBodySchema.safeParse({}))).toBe('errors.validation.shopping_batch_invalid');
    const tooMany = Array.from({ length: ShoppingListLimits.BatchMax + 1 }, () => ({ label: 'x' }));
    expect(firstMessage(AddShoppingItemsBodySchema.safeParse({ items: tooMany }))).toBe('errors.validation.shopping_batch_invalid');
    expect(firstMessage(AddShoppingItemsBodySchema.safeParse({ items: [{ label: '  ' }] }))).toBe('errors.validation.shopping_label_required');
    expect(firstMessage(AddShoppingItemsBodySchema.safeParse({ items: [{ label: 'a', quantity: 0 }] }))).toBe('errors.validation.shopping_quantity_invalid');
    expect(firstMessage(AddShoppingItemsBodySchema.safeParse({ items: [{ label: 'a', quantity: '2' }] }))).toBe('errors.validation.shopping_quantity_invalid');
    expect(firstMessage(AddShoppingItemsBodySchema.safeParse({ items: [{ label: 'a', recipeId: 'nope' }] }))).toBe('errors.validation.shopping_item_invalid');
    expect(firstMessage(UpdateShoppingItemBodySchema.safeParse({ checked: 'yes' }))).toBe('errors.validation.shopping_item_invalid');
    expect(firstMessage(UpdateShoppingItemBodySchema.safeParse({}))).toBe('errors.validation.nothing_to_edit');
  });

  it('lets an edit clear quantity and unit with null', () => {
    expect(UpdateShoppingItemBodySchema.safeParse({ quantity: null, unit: null }).success).toBe(true);
  });
});
