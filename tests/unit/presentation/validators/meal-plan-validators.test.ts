import {
  AddMealPlanEntryBodySchema,
  CopyMealPlanBodySchema,
  MealPlanRangeQuerySchema,
  UpdateMealPlanEntryBodySchema,
} from '@presentation/validators/meal-plan/meal-plan.validators';

const firstMessage = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.success ? null : result.error?.issues[0]?.message;
const RECIPE = '11111111-1111-4111-8111-111111111111';

describe('meal plan validators', () => {
  it('accepts a plan on the diary portion scale', () => {
    for (const servings of [0.5, 1, 2.5, 20]) {
      expect(AddMealPlanEntryBodySchema.safeParse({ date: '2026-10-12', meal: 'LUNCH', recipeId: RECIPE, servings }).success).toBe(true);
    }
  });

  it('answers every refusal with a catalogue key', () => {
    const base = { date: '2026-10-12', meal: 'LUNCH', recipeId: RECIPE, servings: 1 };
    expect(firstMessage(AddMealPlanEntryBodySchema.safeParse({ ...base, servings: 0 }))).toBe('errors.validation.servings_invalid');
    expect(firstMessage(AddMealPlanEntryBodySchema.safeParse({ ...base, servings: 20.5 }))).toBe('errors.validation.servings_invalid');
    expect(firstMessage(AddMealPlanEntryBodySchema.safeParse({ ...base, servings: 1.2 }))).toBe('errors.validation.servings_invalid');
    expect(firstMessage(AddMealPlanEntryBodySchema.safeParse({ ...base, meal: 'BRUNCH' }))).toBe('errors.validation.meal_invalid');
    expect(firstMessage(AddMealPlanEntryBodySchema.safeParse({ ...base, recipeId: 'x' }))).toBe('errors.not_found.recipe');
    expect(firstMessage(AddMealPlanEntryBodySchema.safeParse({ ...base, date: 5 }))).toBe('errors.validation.date_invalid');
    expect(firstMessage(UpdateMealPlanEntryBodySchema.safeParse({ position: -1 }))).toBe('errors.validation.meal_plan_entry_invalid');
    expect(firstMessage(UpdateMealPlanEntryBodySchema.safeParse({ position: 1.5 }))).toBe('errors.validation.meal_plan_entry_invalid');
    expect(firstMessage(UpdateMealPlanEntryBodySchema.safeParse({}))).toBe('errors.validation.nothing_to_edit');
    expect(firstMessage(MealPlanRangeQuerySchema.safeParse({ from: '2026-10-12' }))).toBe('errors.validation.meal_plan_range_invalid');
    expect(firstMessage(CopyMealPlanBodySchema.safeParse({ fromWeekStart: '2026-10-12' }))).toBe('errors.validation.meal_plan_range_invalid');
  });
});
