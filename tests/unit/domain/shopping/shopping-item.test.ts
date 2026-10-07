import { ShoppingItem, type ShoppingItemProps } from '@domain/shopping/shopping-item';
import { ShoppingQuantity } from '@domain/shopping/shopping-quantity';
import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';

const NOW = new Date('2026-10-07T10:00:00Z');
const LATER = new Date('2026-10-07T11:00:00Z');

function props(over: Partial<ShoppingItemProps> = {}): ShoppingItemProps {
  return {
    id: 'i1', userId: 'u1', label: 'Domates', quantity: 2, unit: 'adet', recipeId: null, recipeName: null,
    checked: false, position: 0, createdAt: NOW, updatedAt: NOW, ...over,
  };
}

function item(over: Partial<ShoppingItemProps> = {}): ShoppingItem {
  const built = ShoppingItem.create(props(over));
  if (!built.ok) throw new Error(built.failure.messageKey);
  return built.value;
}

const keyOf = (over: Partial<ShoppingItemProps>) => {
  const built = ShoppingItem.create(props(over));
  return built.ok ? null : built.failure.messageKey;
};

describe('ShoppingItem.create', () => {
  it('squishes the label and turns a blank unit into null', () => {
    const built = item({ label: '  Kırmızı   biber ', unit: '   ' });
    expect(built.label).toBe('Kırmızı biber');
    expect(built.unit).toBeNull();
  });

  it('refuses an empty or over-long label, a bad quantity and an over-long unit', () => {
    expect(keyOf({ label: '   ' })).toBe('errors.validation.shopping_label_required');
    expect(keyOf({ label: 'x'.repeat(ShoppingListLimits.LabelMaxLength + 1) })).toBe('errors.validation.shopping_label_too_long');
    expect(keyOf({ quantity: 0 })).toBe('errors.validation.shopping_quantity_invalid');
    expect(keyOf({ quantity: -1 })).toBe('errors.validation.shopping_quantity_invalid');
    expect(keyOf({ quantity: Number.NaN })).toBe('errors.validation.shopping_quantity_invalid');
    expect(keyOf({ quantity: ShoppingListLimits.QuantityMax + 1 })).toBe('errors.validation.shopping_quantity_invalid');
    expect(keyOf({ unit: 'u'.repeat(ShoppingListLimits.UnitMaxLength + 1) })).toBe('errors.validation.shopping_unit_too_long');
  });

  it('keeps a recipe name only alongside a recipe id', () => {
    expect(item({ recipeName: 'Menemen' }).recipeName).toBeNull();
    expect(item({ recipeId: 'r1', recipeName: ' Menemen ' }).recipeName).toBe('Menemen');
  });

  it('rounds the quantity to three decimals', () => {
    expect(item({ quantity: 0.1 + 0.2 }).quantity).toBe(0.3);
  });
});

describe('ShoppingItem.mergeKey', () => {
  it('treats case, Turkish letters, accents and spacing as the same item', () => {
    expect(ShoppingItem.mergeKey('DOMATES', 'Su  Bardağı')).toBe(ShoppingItem.mergeKey(' domates', 'su bardagi'));
    expect(ShoppingItem.mergeKey('Şeker', null)).toBe(ShoppingItem.mergeKey('seker', ''));
    expect(ShoppingItem.mergeKey('Café', 'g')).toBe(ShoppingItem.mergeKey('cafe', 'G'));
  });

  it('keeps different units apart', () => {
    expect(ShoppingItem.mergeKey('un', 'g')).not.toBe(ShoppingItem.mergeKey('un', 'cup'));
    expect(ShoppingItem.mergeKey('un', 'g')).not.toBe(ShoppingItem.mergeKey('un', null));
  });
});

describe('ShoppingItem merging and editing', () => {
  it('only an unchecked item with the same key absorbs another', () => {
    const incoming = item({ id: 'i2', label: 'domates', quantity: 3 });
    expect(item().canAbsorb(incoming)).toBe(true);
    expect(item({ checked: true }).canAbsorb(incoming)).toBe(false);
    expect(item({ unit: 'kg' }).canAbsorb(incoming)).toBe(false);
  });

  it('absorbing sums the quantities and keeps its own label, unit and source', () => {
    const target = item({ recipeId: 'r1', recipeName: 'Menemen' });
    const merged = target.absorb(item({ id: 'i2', label: 'DOMATES', quantity: 1.5, recipeId: 'r2', recipeName: 'Salata' }), LATER);
    expect(merged.ok && merged.value.quantity).toBe(3.5);
    expect(merged.ok && merged.value.label).toBe('Domates');
    expect(merged.ok && merged.value.recipeId).toBe('r1');
    expect(merged.ok && merged.value.updatedAt).toBe(LATER);
  });

  it('applies an edit, clearing quantity and unit with null', () => {
    const edited = item().apply({ label: ' Cherry domates ', quantity: null, unit: null, checked: true }, LATER);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.label).toBe('Cherry domates');
    expect(edited.value.quantity).toBeNull();
    expect(edited.value.unit).toBeNull();
    expect(edited.value.checked).toBe(true);
  });

  it('refuses an edit that would break an invariant', () => {
    const edited = item().apply({ label: '' }, LATER);
    expect(!edited.ok && edited.failure.messageKey).toBe('errors.validation.shopping_label_required');
  });
});

describe('ShoppingQuantity.sum', () => {
  it('treats null as unknown, not zero', () => {
    expect(ShoppingQuantity.sum(null, null)).toBeNull();
    expect(ShoppingQuantity.sum(2, null)).toBe(2);
    expect(ShoppingQuantity.sum(null, 2)).toBe(2);
    expect(ShoppingQuantity.sum(0.1, 0.2)).toBe(0.3);
  });
});
