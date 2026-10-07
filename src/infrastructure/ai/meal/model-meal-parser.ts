import { fail, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { DetectedMealItem, MealParseInput, MealParserInterface } from '@application/diary/ports/meal-parser-interface';
import type { MealModelInterface } from '@infrastructure/ai/meal/meal-model-interface';
import { buildMealParsePrompt } from '@infrastructure/ai/meal/meal-parse-prompt';
import { readMealParseResponse } from '@infrastructure/ai/meal/read-meal-parse-response';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Asks each provider in order until one answers with a readable meal.
 *
 * @remarks
 * - **Order is the factory's** (Gemini first, Groq last); this holds whatever
 *   it is given.
 * - **A garbled answer is an outage of that provider**, not an empty plate:
 *   the next one is asked. Every provider failing is a 503 with
 *   `errors.meal_parse.unavailable`.
 */
export class ModelMealParser implements MealParserInterface {
  constructor(private readonly models: readonly MealModelInterface[]) {}

  async parse(req: { input: MealParseInput; locale: string }): Promise<Result<readonly DetectedMealItem[], Failure>> {
    const usable = this.models.filter((model) => model.canRun());
    if (usable.length === 0) return fail(new ServiceUnavailableFailure('errors.ai.provider_not_configured'));

    const prompt = buildMealParsePrompt(req.locale, 'text' in req.input ? req.input.text : undefined);
    const photo = 'photo' in req.input ? req.input.photo : undefined;

    let last: Failure = new ServiceUnavailableFailure('errors.meal_parse.unavailable');
    for (const model of usable) {
      const answer = await model.complete(prompt, photo);
      const read = answer.ok ? readMealParseResponse(answer.value) : answer;
      if (read.ok) return read;
      logger.warn({ provider: model.provider, messageKey: read.failure.messageKey }, 'meal_parse_provider_failed');
      last = read.failure;
    }
    return fail(last);
  }
}
