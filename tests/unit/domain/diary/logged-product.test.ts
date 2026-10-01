import { LoggedProduct, type LoggedProductProps } from '@domain/diary/logged-product';
import { FoodLogEntry } from '@domain/diary/food-log-entry';
import { CalendarDate } from '@domain/diary/calendar-date';
import { MealSlot } from '@domain/diary/meal-slot';
import { Nutrients } from '@domain/diary/nutrients';
import { FoodSource } from '@domain/foods/food-source';

const curated: LoggedProductProps = {
  source: FoodSource.Curated,
  foodVariantId: '11111111-1111-4111-8111-111111111111',
  offBarcode: null,
  unitKey: 'glass',
  unitAmount: 200,
};
const branded: LoggedProductProps = { source: FoodSource.OpenFoodFacts, foodVariantId: null, offBarcode: '8681324002837', unitKey: 'pack', unitAmount: 285 };

describe('LoggedProduct.create', () => {
  it.each([
    ['a curated variant in a serving unit', curated],
    ['a curated variant in grams', { ...curated, unitKey: 'g', unitAmount: 1 }],
    ['an Open Food Facts barcode by the pack', branded],
  ])('accepts %s', (_label, props) => {
    expect(LoggedProduct.create(props).ok).toBe(true);
  });

  it.each([
    ['a curated product without its variant', { ...curated, foodVariantId: null }, 'errors.validation.food_product_invalid'],
    ['a curated product that also names a barcode', { ...curated, offBarcode: '12345678' }, 'errors.validation.food_product_invalid'],
    ['a branded product without a barcode', { ...branded, offBarcode: null }, 'errors.validation.food_product_invalid'],
    ['a barcode that is not 6-14 digits', { ...branded, offBarcode: 'abc123' }, 'errors.validation.food_product_invalid'],
    ['a branded product that also names a variant', { ...branded, foodVariantId: curated.foodVariantId }, 'errors.validation.food_product_invalid'],
    ['an unknown unit', { ...curated, unitKey: 'bowl' }, 'errors.validation.food_unit_invalid'],
    ['a zero unit size', { ...curated, unitAmount: 0 }, 'errors.validation.food_amount_invalid'],
    ['an implausible unit size', { ...curated, unitAmount: 5000 }, 'errors.validation.food_amount_invalid'],
  ])('refuses %s', (_label, props, key) => {
    const result = LoggedProduct.create(props as LoggedProductProps);
    expect(!result.ok && result.failure.messageKey).toBe(key);
  });
});

describe('FoodLogEntry with a product', () => {
  const nutrients = (calories: number) => {
    const n = Nutrients.create({ calories, protein: 1, carbs: 1, fat: 1, fiber: 0 });
    if (!n.ok) throw new Error('fixture');
    return n.value;
  };
  const date = CalendarDate.parse('2026-10-01');
  if (!date.ok) throw new Error('fixture');
  const entry = (servings: number, product: LoggedProduct | null, recipeId: string | null = null) =>
    FoodLogEntry.create({
      id: 'e1', userId: 'u1', date: date.value, meal: MealSlot.Breakfast, name: 'Ayran', servings,
      nutrients: nutrients(100), recipeId, product, createdAt: new Date(), updatedAt: new Date(),
    });
  const product = (props: LoggedProductProps = curated) => {
    const p = LoggedProduct.create(props);
    if (!p.ok) throw new Error('fixture');
    return p.value;
  };

  // 150 g of cheese is 150 units of 'g' — far past the 20 a recipe's servings allow.
  it('counts a product in its unit, in half steps, well past 20', () => {
    expect(entry(150, product({ ...curated, unitKey: 'g', unitAmount: 1 })).ok).toBe(true);
    expect(entry(1.5, product()).ok).toBe(true);
    expect(entry(150.25, product()).ok).toBe(false);
  });

  it('still holds a recipe or quick-add entry to 20 servings', () => {
    const result = entry(21, null);
    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.servings_invalid');
  });

  it('refuses an entry that names both a recipe and a product', () => {
    const result = entry(1, product(), 'recipe-1');
    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.food_product_invalid');
  });

  it('rescales a product entry to a new quantity past 20, keeping per-unit values', () => {
    const created = entry(2, product());
    if (!created.ok) throw new Error('fixture');
    const changed = created.value.apply({ servings: 30 }, new Date());
    expect(changed.ok && changed.value.nutrients.values.calories).toBe(1500);
    expect(changed.ok && changed.value.perServing().values.calories).toBe(50);
  });
});
