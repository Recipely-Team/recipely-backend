import type { MealParserInterface } from '@application/diary/ports/meal-parser-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { VisionModels } from '@infrastructure/ai/vision-models';
import type { MealModelInterface } from '@infrastructure/ai/meal/meal-model-interface';
import { GeminiMealModel } from '@infrastructure/ai/meal/gemini-meal-model';
import { GroqMealModel } from '@infrastructure/ai/meal/groq-meal-model';
import { ModelMealParser } from '@infrastructure/ai/meal/model-meal-parser';

export interface MealParserFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
  /** `GEMINI_MODEL_NAME` / `GROQ_MODEL_NAME` — text models; photos go to {@link VisionModels}. */
  readonly geminiTextModel: string;
  readonly groqTextModel: string;
}

/**
 * The meal parser over the providers that hold keys: Gemini first, Groq last —
 * the order every AI chain here uses.
 */
export function createMealParser(input: MealParserFactoryInput): MealParserInterface {
  const models: MealModelInterface[] = [];
  if (input.geminiKeys.size > 0) models.push(new GeminiMealModel(input.geminiKeys, input.geminiTextModel, VisionModels.gemini));
  if (input.groqKeys.size > 0) models.push(new GroqMealModel(input.groqKeys, input.groqTextModel, VisionModels.groq));
  return new ModelMealParser(models);
}
