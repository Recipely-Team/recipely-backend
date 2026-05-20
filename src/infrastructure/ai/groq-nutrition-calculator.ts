import Groq from 'groq-sdk';
import { z } from 'zod';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, UnprocessableFailure, type Failure } from '@core/failure';
import type { INutritionCalculator, NutritionInput, NutritionResult } from '@application/ai/ports/i-nutrition-calculator';
import { extractJsonBlock } from '@infrastructure/ai/recipe-prompt';
import { logger } from '@presentation/server/logger';

const NutritionResponseSchema = z.object({
  caloriesPerServing: z.number().int().min(0).max(10_000),
  protein: z.number().min(0).max(500),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(500),
  fiber: z.number().min(0).max(100),
});

const SYSTEM_PROMPT = [
  'You are a certified nutrition expert.',
  'Given a recipe\'s ingredient list and serving count, calculate the approximate nutritional information PER SERVING.',
  'Respond with ONLY a JSON object, no markdown, no commentary:',
  '{',
  '  "caloriesPerServing": integer (kcal per serving),',
  '  "protein": number (grams per serving),',
  '  "carbs": number (grams per serving),',
  '  "fat": number (grams per serving),',
  '  "fiber": number (grams per serving)',
  '}',
].join('\n');

export class GroqNutritionCalculator implements INutritionCalculator {
  private readonly client: Groq;

  constructor(private readonly config: { readonly apiKey: string; readonly model: string }) {
    this.client = new Groq({ apiKey: config.apiKey });
  }

  async calculate(input: NutritionInput): Promise<Result<NutritionResult, Failure>> {
    const userPrompt = `Servings: ${input.servings}\n\nIngredients:\n${input.ingredients.join('\n')}`;

    let rawText: string;
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
    } catch (err) {
      logger.error({ err, model: this.config.model }, 'groq_nutrition_request_failed');
      return fail(new UnknownFailure('errors.ai.upstream_failed'));
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

    return ok(validated.data);
  }
}
