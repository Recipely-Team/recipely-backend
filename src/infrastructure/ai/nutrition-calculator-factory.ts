import type { INutritionCalculator } from '@application/ai/ports/i-nutrition-calculator';
import { GroqNutritionCalculator } from '@infrastructure/ai/groq-nutrition-calculator';
import { DisabledNutritionCalculator } from '@infrastructure/ai/disabled-nutrition-calculator';
import { logger } from '@presentation/server/logger';

export interface NutritionCalculatorFactoryInput {
  readonly model: string;
  readonly groqApiKey?: string | undefined;
}

// Always uses Groq when a key is available — Groq's free tier covers this
// use case well. Falls back to disabled adapter so a missing key never
// prevents the API from booting; nutrition endpoints just return a clear error.
export function createNutritionCalculator(input: NutritionCalculatorFactoryInput): INutritionCalculator {
  if (input.groqApiKey && input.groqApiKey.trim().length > 0) {
    return new GroqNutritionCalculator({ apiKey: input.groqApiKey, model: input.model });
  }
  logger.warn('GROQ_API_KEY not set — nutrition calculation disabled');
  return new DisabledNutritionCalculator();
}
