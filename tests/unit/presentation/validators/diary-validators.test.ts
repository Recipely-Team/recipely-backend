import {
  CreateFoodLogEntryBodySchema,
  NutritionGoalsBodySchema,
  RecentFoodsQuerySchema,
  SetDayWaterBodySchema,
  UpdateFoodLogEntryBodySchema,
} from '@presentation/validators/diary.validators';

const entry = {
  date: '2026-09-30',
  meal: 'LUNCH',
  name: 'Menemen',
  servings: 1.5,
  calories: 420,
  protein: 18.2,
  carbs: 12,
  fat: 30,
};

// The error handler forwards a lone zod message verbatim, so every refusal has
// to be a catalogue key — zod's own copy is English whatever the locale.
const soleMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined =>
  result.error?.issues[0]?.message;

describe('diary validators', () => {
  it('accepts an entry with optional fiber and recipe omitted or null', () => {
    expect(CreateFoodLogEntryBodySchema.safeParse(entry).success).toBe(true);
    expect(CreateFoodLogEntryBodySchema.safeParse({ ...entry, fiber: null, recipeId: null }).success).toBe(true);
  });

  it.each([
    [{ meal: 'BRUNCH' }, 'errors.validation.meal_invalid'],
    [{ name: '   ' }, 'errors.validation.food_name_required'],
    [{ name: 'x'.repeat(121) }, 'errors.validation.food_name_too_long'],
    [{ servings: 0 }, 'errors.validation.servings_invalid'],
    [{ servings: 21 }, 'errors.validation.servings_invalid'],
    [{ servings: '2' }, 'errors.validation.servings_invalid'],
    [{ calories: -5 }, 'errors.validation.nutrient_invalid'],
    [{ protein: 'lots' }, 'errors.validation.nutrient_invalid'],
    [{ recipeId: 'not-a-uuid' }, 'errors.not_found.recipe'],
  ])('refuses %p with %s', (patch, key) => {
    expect(soleMessage(CreateFoodLogEntryBodySchema.safeParse({ ...entry, ...patch }))).toBe(key);
  });

  it('refuses an empty PATCH', () => {
    expect(soleMessage(UpdateFoodLogEntryBodySchema.safeParse({}))).toBe('errors.validation.nothing_to_edit');
    expect(UpdateFoodLogEntryBodySchema.safeParse({ servings: 2 }).success).toBe(true);
  });

  it('bounds water to 0..30 whole glasses', () => {
    expect(SetDayWaterBodySchema.safeParse({ glasses: 0 }).success).toBe(true);
    expect(soleMessage(SetDayWaterBodySchema.safeParse({ glasses: 31 }))).toBe('errors.validation.water_invalid');
  });

  it('defaults the recent limit to 20 and caps it at 50', () => {
    expect(RecentFoodsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(RecentFoodsQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5 });
    expect(soleMessage(RecentFoodsQuerySchema.safeParse({ limit: '51' }))).toBe('errors.validation.limit_invalid');
  });

  it('holds goals to their ranges', () => {
    const goals = { calories: 2000, protein: 100, carbs: 250, fat: 70, waterGlasses: 8 };
    expect(NutritionGoalsBodySchema.safeParse(goals).success).toBe(true);
    expect(soleMessage(NutritionGoalsBodySchema.safeParse({ ...goals, calories: 799 }))).toBe('errors.validation.goal_invalid');
    expect(soleMessage(NutritionGoalsBodySchema.safeParse({ ...goals, waterGlasses: 31 }))).toBe('errors.validation.goal_invalid');
  });
});
