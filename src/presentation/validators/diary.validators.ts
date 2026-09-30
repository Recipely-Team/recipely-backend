import { z } from 'zod';
import { DiaryLimits } from '@domain/diary/diary-limits';
import { MEAL_SLOTS } from '@domain/diary/meal-slot';

// Every refusal carries a catalogue key, including a wrong TYPE: zod's own
// messages are English copy the error handler would forward to any locale.
const keyed = (key: string) => ({ invalid_type_error: key, required_error: key });
const bounded = (key: string, max: number) => z.number(keyed(key)).min(0, key).max(max, key);

const date = z.string(keyed('errors.validation.date_invalid'));
const meal = z.enum(MEAL_SLOTS, { errorMap: () => ({ message: 'errors.validation.meal_invalid' }) });
const servings = z
  .number(keyed('errors.validation.servings_invalid'))
  .positive('errors.validation.servings_invalid')
  .max(DiaryLimits.ServingsMax, 'errors.validation.servings_invalid');
const nutrient = bounded('errors.validation.nutrient_invalid', DiaryLimits.EntryMacroMax);
const goalMacro = bounded('errors.validation.goal_invalid', DiaryLimits.GoalMacroMax);

export const DiaryDateParamSchema = z.object({ date });

export const DiaryMonthParamSchema = z.object({ month: z.string(keyed('errors.validation.month_invalid')) });

export const DiaryEntryIdParamSchema = z.object({
  id: z.string().uuid('errors.not_found.diary_entry'),
});

export const RecentFoodsQuerySchema = z.object({
  limit: z.coerce
    .number(keyed('errors.validation.limit_invalid'))
    .int('errors.validation.limit_invalid')
    .min(1, 'errors.validation.limit_invalid')
    .max(DiaryLimits.RecentMax, 'errors.validation.limit_invalid')
    .default(DiaryLimits.RecentDefault),
});

export const CreateFoodLogEntryBodySchema = z.object({
  date,
  meal,
  name: z
    .string(keyed('errors.validation.food_name_required'))
    .trim()
    .min(1, 'errors.validation.food_name_required')
    .max(DiaryLimits.NameMaxLength, 'errors.validation.food_name_too_long'),
  servings,
  calories: bounded('errors.validation.nutrient_invalid', DiaryLimits.EntryCaloriesMax),
  protein: nutrient,
  carbs: nutrient,
  fat: nutrient,
  fiber: nutrient.nullable().optional(),
  recipeId: z.string().uuid('errors.not_found.recipe').nullable().optional(),
});

export type CreateFoodLogEntryBody = z.infer<typeof CreateFoodLogEntryBodySchema>;

export const UpdateFoodLogEntryBodySchema = z
  .object({ meal: meal.optional(), servings: servings.optional(), date: date.optional() })
  .refine((body) => body.meal !== undefined || body.servings !== undefined || body.date !== undefined, {
    message: 'errors.validation.nothing_to_edit',
  });

export const SetDayWaterBodySchema = z.object({
  glasses: z
    .number(keyed('errors.validation.water_invalid'))
    .int('errors.validation.water_invalid')
    .min(0, 'errors.validation.water_invalid')
    .max(DiaryLimits.WaterGlassesMax, 'errors.validation.water_invalid'),
});

export const NutritionGoalsBodySchema = z.object({
  calories: z
    .number(keyed('errors.validation.goal_invalid'))
    .int('errors.validation.goal_invalid')
    .min(DiaryLimits.GoalCaloriesMin, 'errors.validation.goal_invalid')
    .max(DiaryLimits.GoalCaloriesMax, 'errors.validation.goal_invalid'),
  protein: goalMacro,
  carbs: goalMacro,
  fat: goalMacro,
  waterGlasses: z
    .number(keyed('errors.validation.goal_invalid'))
    .int('errors.validation.goal_invalid')
    .min(DiaryLimits.GoalWaterMin, 'errors.validation.goal_invalid')
    .max(DiaryLimits.GoalWaterMax, 'errors.validation.goal_invalid'),
});
