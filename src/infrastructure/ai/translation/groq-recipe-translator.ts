import Groq from 'groq-sdk';
import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { RecipeTranslatorInterface, TranslateRecipeInput, TranslateRecipeResult } from '@application/recipes/ports/recipe-translator-interface';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import { buildTranslationInstruction, buildTranslationMessage, parseTranslationReply } from '@infrastructure/ai/translation/recipe-translation-prompt';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const TOO_MANY_REQUESTS = 429;
const TEMPERATURE = 0.2;

export interface GroqRecipeTranslatorConfig {
  readonly keys: ApiKeyPool;
  readonly model: string;
}

/**
 * A recipe in more languages, from Groq — the chain's last resort.
 *
 * `reasoning_effort: 'low'` for the refiner's measured reason: left alone, the
 * reasoning model spends the completion budget thinking and answers nothing.
 */
export class GroqRecipeTranslator implements RecipeTranslatorInterface {
  constructor(private readonly config: GroqRecipeTranslatorConfig) {}

  async translate(input: TranslateRecipeInput): Promise<Result<TranslateRecipeResult, Failure>> {
    const apiKey = this.config.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    const startedAt = Date.now();
    try {
      const completion = await new Groq({ apiKey, maxRetries: 2 }).chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: buildTranslationInstruction(input) },
          { role: 'user', content: buildTranslationMessage(input) },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        temperature: TEMPERATURE,
      });
      this.config.keys.succeed(apiKey, Date.now() - startedAt);
      return parseTranslationReply(completion.choices[0]?.message?.content ?? '', input);
    } catch (err) {
      if ((err as { status?: unknown }).status === TOO_MANY_REQUESTS) this.config.keys.penalise(apiKey);
      logger.warn({ errMessage: err instanceof Error ? err.message : String(err), model: this.config.model }, 'groq_translate_failed');
      return fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'));
    }
  }
}
