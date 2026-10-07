import { planShoppingBatch, type ShoppingBatchInput, type ShoppingItemData } from '@domain/shopping/shopping-batch';
import { ShoppingItem } from '@domain/shopping/shopping-item';
import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';

const NOW = new Date('2026-10-07T10:00:00Z');

function existing(id: string, label: string, quantity: number | null, unit: string | null, checked = false, position = 0): ShoppingItem {
  const built = ShoppingItem.create({
    id, userId: 'u1', label, quantity, unit, recipeId: null, recipeName: null, checked, position, createdAt: NOW, updatedAt: NOW,
  });
  if (!built.ok) throw new Error(built.failure.messageKey);
  return built.value;
}

const line = (label: string, quantity: number | null = null, unit: string | null = null): ShoppingItemData => ({
  label, quantity, unit, recipeId: 'r1', recipeName: 'Menemen',
});

function plan(over: Partial<ShoppingBatchInput>) {
  let n = 0;
  return planShoppingBatch({
    userId: 'u1', unchecked: [], currentCount: 0, nextPosition: 0, incoming: [], now: NOW,
    newId: () => `new-${(n += 1)}`, ...over,
  });
}

describe('planShoppingBatch', () => {
  it('merges into an unchecked item with the same folded label and unit, summing quantities', () => {
    const result = plan({ unchecked: [existing('e1', 'Domates', 2, 'adet')], currentCount: 1, incoming: [line('domates ', 3, 'Adet')] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inserted).toHaveLength(0);
    expect(result.value.updated.map((i) => [i.id, i.quantity])).toEqual([['e1', 5]]);
    expect(result.value.touched.map((i) => i.id)).toEqual(['e1']);
  });

  it('inserts when the unit differs, and positions new lines after the list', () => {
    const result = plan({ unchecked: [existing('e1', 'Un', 200, 'g')], currentCount: 4, nextPosition: 7, incoming: [line('Un', 1, 'su bardağı')] });
    expect(result.ok && result.value.inserted.map((i) => [i.label, i.unit, i.position])).toEqual([['Un', 'su bardağı', 7]]);
  });

  it('never merges into a checked item — those are not passed in, so a same-name line is inserted', () => {
    const result = plan({ unchecked: [], currentCount: 1, incoming: [line('Domates', 1)] });
    expect(result.ok && result.value.inserted).toHaveLength(1);
  });

  it('merges duplicate lines inside one batch', () => {
    const result = plan({ incoming: [line('Tuz', 1, 'tutam'), line('Biber', 1), line('TUZ', 2, 'Tutam')] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inserted.map((i) => [i.label, i.quantity, i.position])).toEqual([['Tuz', 3, 0], ['Biber', 1, 1]]);
    expect(result.value.updated).toHaveLength(0);
  });

  it('allows a batch that only merges on a full list, and refuses one that would overflow it', () => {
    const full = ShoppingListLimits.ItemsPerUserMax;
    const unchecked = [existing('e1', 'Süt', 1, 'l')];
    expect(plan({ unchecked, currentCount: full, incoming: [line('süt', 1, 'L')] }).ok).toBe(true);
    const over = plan({ unchecked, currentCount: full, incoming: [line('Yumurta', 6)] });
    expect(!over.ok && over.failure.messageKey).toBe('errors.conflict.shopping_list_full');
  });

  it('refuses the whole batch when one line is invalid', () => {
    const result = plan({ incoming: [line('Domates', 1), line('   ')] });
    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.shopping_label_required');
  });

  it('refuses a merge whose sum passes the quantity cap', () => {
    const result = plan({
      unchecked: [existing('e1', 'Un', ShoppingListLimits.QuantityMax, 'g')],
      currentCount: 1,
      incoming: [line('un', 1, 'g')],
    });
    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.shopping_quantity_invalid');
  });
});
