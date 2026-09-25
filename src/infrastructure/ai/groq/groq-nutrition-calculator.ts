import Groq from 'groq-sdk';
import { z } from 'zod';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type { NutritionCalculatorInterface, NutritionInput, NutritionResult } from '@application/ai/ports/nutrition-calculator-interface';
import { isIngredientGroupHeading } from '@domain/recipes/ingredient-group';
import { isPlausibleServingWeight, ServingWeightGrams } from '@domain/recipes/recipe-nutrition';
import { extractJsonBlock } from '@infrastructure/ai/recipe-prompt';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * The model's reply.
 *
 * `servingWeightGrams` is read leniently on purpose: an implausible weight is
 * dropped, not allowed to fail the macros it came with — they are still good.
 */
const NutritionResponseSchema = z.object({
  caloriesPerServing: z.number().int().min(0).max(10_000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
  fiber: z.number().min(0).max(100),
  servingWeightGrams: z
    .unknown()
    .optional()
    .transform((value) => (isPlausibleServingWeight(value) ? value : undefined)),
});

const NUTRITION_SYSTEM_PROMPT = [
  'You are a certified nutrition expert.',
  'Given a recipe\'s ingredient list and serving count, calculate the approximate nutritional information PER SERVING.',
  'Respond with ONLY a JSON object, no markdown, no commentary:',
  '{',
  '  "caloriesPerServing": integer (kcal per serving),',
  '  "protein": number (grams per serving),',
  '  "carbs": number (grams per serving),',
  '  "fat": number (grams per serving),',
  '  "fiber": number (grams per serving),',
  `  "servingWeightGrams": integer (${ServingWeightGrams.Min}-${ServingWeightGrams.Max}, the COOKED weight of one serving in grams)`,
  '}',
  'Estimate servingWeightGrams from the ingredient amounts and the cooking method:',
  'water lost in roasting, frying or baking makes the dish lighter than its raw ingredients;',
  'water absorbed by pasta, rice, grains or legumes makes it heavier. Divide the cooked total by the servings.',
].join('\n');

export class GroqNutritionCalculator implements NutritionCalculatorInterface {
  private readonly client: Groq;

  constructor(private readonly config: { readonly apiKey: string; readonly model: string }) {
    this.client = new Groq({ apiKey: config.apiKey, maxRetries: 2 });
  }

  async calculate(input: NutritionInput): Promise<Result<NutritionResult, Failure>> {
    // Group headings ("# Syrup") name a component; they are not something to
    // estimate calories from, and feeding them to the model invites it to
    // treat the heading as an ingredient with an implied quantity.
    const measurable = input.ingredients.filter((line) => !isIngredientGroupHeading(line));
    const method = input.instructions ?? [];
    const userPrompt = [
      `Servings: ${input.servings}`,
      `Ingredients:\n${measurable.join('\n')}`,
      ...(method.length > 0 ? [`Method:\n${method.join('\n')}`] : []),
    ].join('\n\n');

    let rawText: string;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: NUTRITION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      logger.error({ err, model: this.config.model }, 'groq_nutrition_request_failed');
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractJsonBlock(rawText));
    } catch {
      logger.error({ rawText: rawText.slice(0, 500) }, 'groq_nutrition_json_parse_failed');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const validated = NutritionResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      logger.error({ issues: validated.error.issues }, 'groq_nutrition_schema_mismatch');
      return fail(new UnprocessableFailure('errors.ai.invalid_response', 'response'));
    }

    const { servingWeightGrams, ...macros } = validated.data;
    return ok({ ...macros, ...(servingWeightGrams !== undefined ? { servingWeightGrams } : {}) });
  }
}
