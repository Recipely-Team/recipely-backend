import { z } from 'zod';
import { FRIDGE_DIETS, FridgeDiet } from '@domain/fridge/fridge-diet';
import { FridgeLimits } from '@application/fridge/fridge-limits';

// Every refusal carries a catalogue key, including a wrong TYPE: zod's own
// messages are English copy the error handler would forward to any locale.
const keyed = (key: string) => ({ invalid_type_error: key, required_error: key });

const INGREDIENTS_INVALID = 'errors.fridge.ingredients_invalid';
const OPTIONS_INVALID = 'errors.fridge.options_invalid';

const locale = z.string(keyed(OPTIONS_INVALID)).trim().regex(/^[a-z]{2}(-[A-Za-z]{2})?$/, OPTIONS_INVALID).optional();

/** `POST /fridge/scan` text fields beside the `photos` files. */
export const FridgeScanFieldsSchema = z.object({ locale });

export const FridgeIdeasBodySchema = z.object({
  ingredients: z
    .array(
      z.string(keyed(INGREDIENTS_INVALID)).max(FridgeLimits.ingredientMaxChars, INGREDIENTS_INVALID),
      keyed('errors.fridge.ingredients_required'),
    )
    .min(1, 'errors.fridge.ingredients_required')
    .max(FridgeLimits.maxIdeaIngredients, INGREDIENTS_INVALID),
  maxMinutes: z
    .number(keyed(OPTIONS_INVALID))
    .refine((minutes) => (FridgeLimits.ideaMinutes as readonly number[]).includes(minutes), OPTIONS_INVALID)
    .optional(),
  diet: z.enum(FRIDGE_DIETS, { errorMap: () => ({ message: OPTIONS_INVALID }) }).default(FridgeDiet.None),
  servings: z.number(keyed(OPTIONS_INVALID)).int(OPTIONS_INVALID).min(1, OPTIONS_INVALID).max(FridgeLimits.maxServings, OPTIONS_INVALID).optional(),
  exclude: z
    .array(z.string(keyed(OPTIONS_INVALID)).max(FridgeLimits.excludedMaxChars, OPTIONS_INVALID), keyed(OPTIONS_INVALID))
    .max(FridgeLimits.maxExcluded, OPTIONS_INVALID)
    .default([]),
  locale,
});
