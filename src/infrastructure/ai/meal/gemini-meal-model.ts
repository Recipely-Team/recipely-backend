import { GoogleGenerativeAI } from '@google/generative-ai';
import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import type { ApiKeyPool } from '@infrastructure/ai/keys/api-key-pool';
import type { MealModelInterface } from '@infrastructure/ai/meal/meal-model-interface';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

/**
 * Gemini answering the meal prompt — the text model for words, the vision
 * model for a photo.
 *
 * @remarks
 * JSON response type at temperature zero. A failure logs the provider and the
 * HTTP status only: the prompt holds what the user ate.
 */
export class GeminiMealModel implements MealModelInterface {
  readonly provider = 'gemini';

  constructor(
    private readonly keys: ApiKeyPool,
    private readonly textModel: string,
    private readonly visionModel: string,
  ) {}

  canRun(): boolean {
    return this.keys.size > 0;
  }

  async complete(prompt: string, photo?: { image: Buffer; mimeType: string }): Promise<Result<string, Failure>> {
    const apiKey = this.keys.next();
    if (apiKey === null) return fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable'));
    const startedAt = Date.now();
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: photo !== undefined ? this.visionModel : this.textModel,
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      });
      const parts = photo !== undefined
        ? [{ text: prompt }, { inlineData: { mimeType: photo.mimeType, data: photo.image.toString('base64') } }]
        : [{ text: prompt }];
      const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
      const text = result.response.text();
      this.keys.succeed(apiKey, Date.now() - startedAt);
      return ok(text);
    } catch (err) {
      logger.warn({ provider: this.provider, status: (err as { status?: unknown }).status }, 'meal_parse_request_failed');
      this.keys.fail(apiKey);
      return fail(new ServiceUnavailableFailure('errors.meal_parse.unavailable'));
    }
  }
}
