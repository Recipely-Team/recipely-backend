import { GoogleGenerativeAI } from '@google/generative-ai';
import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { RecipeTranslatorInterface, TranslateRecipeInput, TranslateRecipeResult } from '@application/recipes/ports/recipe-translator-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { buildTranslationInstruction, buildTranslationMessage, parseTranslationReply } from '@infrastructure/ai/translation/recipe-translation-prompt';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const TOO_MANY_REQUESTS = 429;
/** Translation, not invention: low, so a line is rendered rather than rewritten. */
const TEMPERATURE = 0.2;

export interface GeminiRecipeTranslatorConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

/** A recipe in more languages, from Gemini; the key pool rotates off a rate-limited key. */
export class GeminiRecipeTranslator implements RecipeTranslatorInterface {
  constructor(private readonly config: GeminiRecipeTranslatorConfig) {}

  async translate(input: TranslateRecipeInput): Promise<Result<TranslateRecipeResult, Failure>> {
    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    const startedAt = Date.now();
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: this.config.model,
      systemInstruction: buildTranslationInstruction(input),
      generationConfig: { responseMimeType: 'application/json', temperature: TEMPERATURE },
    });
    try {
      const result = await model.generateContent(buildTranslationMessage(input));
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
      return parseTranslationReply(result.response.text(), input);
    } catch (err) {
      if ((err as { status?: unknown }).status === TOO_MANY_REQUESTS) this.config.keys.penalise(apiKey);
      logger.warn({ errMessage: err instanceof Error ? err.message : String(err), model: this.config.model }, 'gemini_translate_failed');
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }
  }
}
