import type { NutritionCalculatorInterface } from '@application/ai/ports/nutrition-calculator-interface';
import { GroqNutritionCalculator } from '@infrastructure/ai/groq/groq-nutrition-calculator';
import { DisabledNutritionCalculator } from '@infrastructure/ai/disabled/disabled-nutrition-calculator';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface NutritionCalculatorFactoryInput {
  readonly model: string;
  readonly groqApiKey?: string | undefined;
}

// Always uses Groq when a key is available — Groq's free tier covers this
// use case well. Falls back to disabled adapter so a missing key never
// prevents the API from booting; nutrition endpoints just return a clear error.
export function createNutritionCalculator(input: NutritionCalculatorFactoryInput): NutritionCalculatorInterface {
  if (input.groqApiKey && input.groqApiKey.trim().length > 0) {
    return new GroqNutritionCalculator({ apiKey: input.groqApiKey, model: input.model });
  }
  logger.warn('GROQ_API_KEY not set — nutrition calculation disabled');
  return new DisabledNutritionCalculator();
}
