import type { RecipeTranslatorInterface } from '@application/recipes/ports/recipe-translator-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { GeminiRecipeTranslator } from '@infrastructure/ai/translation/gemini-recipe-translator';
import { GroqRecipeTranslator } from '@infrastructure/ai/translation/groq-recipe-translator';
import { FallbackRecipeTranslator } from '@infrastructure/ai/translation/fallback-recipe-translator';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

export interface RecipeTranslatorFactoryInput {
  readonly geminiKeys: ApiKeyPool;
  readonly groqKeys: ApiKeyPool;
  readonly geminiModel: string;
  readonly groqModel: string;
}

const NONE = 0;

/**
 * Gemini first, Groq last — the house order for every AI chain. With no key
 * at all the chain is empty: every call fails as unavailable, and recipes stay
 * readable in the languages they have.
 */
export function createRecipeTranslator(input: RecipeTranslatorFactoryInput): RecipeTranslatorInterface {
  const chain: RecipeTranslatorInterface[] = [];
  if (input.geminiKeys.size > NONE) chain.push(new GeminiRecipeTranslator({ keys: input.geminiKeys, model: input.geminiModel }));
  if (input.groqKeys.size > NONE) chain.push(new GroqRecipeTranslator({ keys: input.groqKeys, model: input.groqModel }));
  if (chain.length === NONE) logger.warn('No Gemini or Groq API keys — recipe translation disabled until one is set');
  return new FallbackRecipeTranslator(chain);
}
