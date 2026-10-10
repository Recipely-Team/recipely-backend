import { z } from 'zod';
import { DiaryLimits } from '@domain/diary/diary-limits';
import { MEAL_SLOTS } from '@domain/diary/meal-slot';
import { MealPlanLimits } from '@domain/meal-plan/meal-plan-limits';

// Every refusal carries a catalogue key, including a wrong TYPE: zod's own
// messages are English copy the error handler would forward to any locale.
// Real calendar days and the 14-day span are checked by MealPlanRange.
const keyed = (key: string) => ({ invalid_type_error: key, required_error: key });

const RANGE_INVALID = 'errors.validation.meal_plan_range_invalid';
const ENTRY_INVALID = 'errors.validation.meal_plan_entry_invalid';

const date = z.string(keyed('errors.validation.date_invalid'));
const meal = z.enum(MEAL_SLOTS, { errorMap: () => ({ message: 'errors.validation.meal_invalid' }) });
// The diary's portion scale, so marking a plan eaten can always log it.
const servings = z
  .number(keyed('errors.validation.servings_invalid'))
  .min(DiaryLimits.ServingsMin, 'errors.validation.servings_invalid')
  .max(DiaryLimits.ServingsMax, 'errors.validation.servings_invalid')
  .multipleOf(DiaryLimits.ServingsStep, 'errors.validation.servings_invalid');
const position = z
  .number(keyed(ENTRY_INVALID))
  .int(ENTRY_INVALID)
  .min(0, ENTRY_INVALID)
  .max(MealPlanLimits.PositionMax, ENTRY_INVALID);

export const MealPlanRangeQuerySchema = z.object({
  from: z.string(keyed(RANGE_INVALID)),
  to: z.string(keyed(RANGE_INVALID)),
});

export const AddMealPlanEntryBodySchema = z.object({
  date,
  meal,
  recipeId: z.string(keyed('errors.not_found.recipe')).uuid('errors.not_found.recipe'),
  servings,
});

export const UpdateMealPlanEntryBodySchema = z
  .object({ date: date.optional(), meal: meal.optional(), servings: servings.optional(), position: position.optional() })
  .refine(
    (body) => body.date !== undefined || body.meal !== undefined || body.servings !== undefined || body.position !== undefined,
    { message: 'errors.validation.nothing_to_edit' },
  );

export const CopyMealPlanBodySchema = z.object({
  fromWeekStart: z.string(keyed(RANGE_INVALID)),
  toWeekStart: z.string(keyed(RANGE_INVALID)),
});

export const MealPlanEntryIdParamSchema = z.object({
  id: z.string().uuid('errors.not_found.meal_plan_entry'),
});
