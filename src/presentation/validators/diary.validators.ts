import { z } from 'zod';
import { DiaryLimits } from '@domain/diary/diary-limits';
import { MEAL_SLOTS } from '@domain/diary/meal-slot';
import { FoodSource } from '@domain/foods/food-source';
import { DiarySearchLimits } from '@application/diary/diary-search-limits';
import { DIARY_FOOD_GROUPS } from '@application/diary/diary-food-group';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';

// Every refusal carries a catalogue key, including a wrong TYPE: zod's own
// messages are English copy the error handler would forward to any locale.
const keyed = (key: string) => ({ invalid_type_error: key, required_error: key });
const bounded = (key: string, max: number) => z.number(keyed(key)).min(0, key).max(max, key);

const date = z.string(keyed('errors.validation.date_invalid'));
const meal = z.enum(MEAL_SLOTS, { errorMap: () => ({ message: 'errors.validation.meal_invalid' }) });
// The product ceiling (150 g is 150 units of 'g'); the entry itself holds a
// recipe or quick-add to ServingsMax with the same key.
const servings = z
  .number(keyed('errors.validation.servings_invalid'))
  .min(DiaryLimits.ServingsMin, 'errors.validation.servings_invalid')
  .max(DiaryLimits.ProductQuantityMax, 'errors.validation.servings_invalid')
  .multipleOf(DiaryLimits.ServingsStep, 'errors.validation.servings_invalid');
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
  // A recipe can carry calories and no macro breakdown: absent or null = unknown.
  protein: nutrient.nullable().optional(),
  carbs: nutrient.nullable().optional(),
  fat: nutrient.nullable().optional(),
  fiber: nutrient.nullable().optional(),
  recipeId: z.string().uuid('errors.not_found.recipe').nullable().optional(),
  // A product entry names what it was logged from; the use case checks the
  // reference and the unit. Never together with recipeId.
  product: z
    .object({
      source: z.nativeEnum(FoodSource, { errorMap: () => ({ message: 'errors.validation.food_product_invalid' }) }),
      foodVariantId: z.string().uuid('errors.not_found.food').nullable().optional(),
      offBarcode: z.string(keyed('errors.validation.food_product_invalid')).nullable().optional(),
      unitKey: z.string(keyed('errors.validation.food_unit_invalid')),
      // Base g/ml in one unit. Only an Open Food Facts `pack` needs it (the
      // pack's size); a curated unit's size is read from the catalogue.
      unitAmount: z
        .number(keyed('errors.validation.food_amount_invalid'))
        .positive('errors.validation.food_amount_invalid')
        .max(DiaryLimits.ProductUnitAmountMax, 'errors.validation.food_amount_invalid')
        .default(1),
    })
    .nullable()
    .optional(),
});

export type CreateFoodLogEntryBody = z.infer<typeof CreateFoodLogEntryBodySchema>;

const searchTerm = z
  .string(keyed('errors.validation.search_query_required'))
  .max(DiarySearchLimits.QueryMaxLength, 'errors.validation.search_query_required');

/** `GET /diary/foods/search`. An empty `q` reaches the use case: a recipe group then lists whole, otherwise `search_query_required`. */
export const DiaryFoodSearchQuerySchema = PaginationQuerySchema.extend({
  q: searchTerm.default(''),
  group: z.enum(DIARY_FOOD_GROUPS).optional(),
});

/** `GET /diary/foods/products` — browse the catalogue; both filters optional. */
export const FoodProductsQuerySchema = PaginationQuerySchema.extend({
  q: searchTerm.optional(),
  category: z.string().max(40).optional(),
});

export const FoodIdParamSchema = z.object({ id: z.string().uuid('errors.not_found.food') });

export const BarcodeParamSchema = z.object({ barcode: z.string().regex(/^\d{6,14}$/, 'errors.not_found.food') });

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
  fiber: goalMacro,
  waterGlasses: z
    .number(keyed('errors.validation.goal_invalid'))
    .int('errors.validation.goal_invalid')
    .min(DiaryLimits.GoalWaterMin, 'errors.validation.goal_invalid')
    .max(DiaryLimits.GoalWaterMax, 'errors.validation.goal_invalid'),
});
